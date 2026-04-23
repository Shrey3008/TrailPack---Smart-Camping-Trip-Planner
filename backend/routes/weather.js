const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// ISO 3166-1 alpha-2 → display name. Used so the /weather response
// returns 'Manali, India' instead of 'Manali, IN'.
const COUNTRY_NAMES = {
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',
  AO:'Angola',AG:'Antigua and Barbuda',AR:'Argentina',
  AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',
  BS:'Bahamas',BH:'Bahrain',BD:'Bangladesh',BB:'Barbados',
  BY:'Belarus',BE:'Belgium',BZ:'Belize',BJ:'Benin',
  BT:'Bhutan',BO:'Bolivia',BA:'Bosnia and Herzegovina',
  BW:'Botswana',BR:'Brazil',BN:'Brunei',BG:'Bulgaria',
  BF:'Burkina Faso',BI:'Burundi',CV:'Cape Verde',
  KH:'Cambodia',CM:'Cameroon',CA:'Canada',
  CF:'Central African Republic',TD:'Chad',CL:'Chile',
  CN:'China',CO:'Colombia',KM:'Comoros',CG:'Congo',
  CR:'Costa Rica',HR:'Croatia',CU:'Cuba',CY:'Cyprus',
  CZ:'Czech Republic',DK:'Denmark',DJ:'Djibouti',
  DM:'Dominica',DO:'Dominican Republic',EC:'Ecuador',
  EG:'Egypt',SV:'El Salvador',GQ:'Equatorial Guinea',
  ER:'Eritrea',EE:'Estonia',SZ:'Eswatini',ET:'Ethiopia',
  FJ:'Fiji',FI:'Finland',FR:'France',GA:'Gabon',
  GM:'Gambia',GE:'Georgia',DE:'Germany',GH:'Ghana',
  GR:'Greece',GD:'Grenada',GT:'Guatemala',GN:'Guinea',
  GW:'Guinea-Bissau',GY:'Guyana',HT:'Haiti',HN:'Honduras',
  HU:'Hungary',IS:'Iceland',IN:'India',ID:'Indonesia',
  IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',
  JM:'Jamaica',JP:'Japan',JO:'Jordan',KZ:'Kazakhstan',
  KE:'Kenya',KI:'Kiribati',KW:'Kuwait',KG:'Kyrgyzstan',
  LA:'Laos',LV:'Latvia',LB:'Lebanon',LS:'Lesotho',
  LR:'Liberia',LY:'Libya',LI:'Liechtenstein',LT:'Lithuania',
  LU:'Luxembourg',MG:'Madagascar',MW:'Malawi',MY:'Malaysia',
  MV:'Maldives',ML:'Mali',MT:'Malta',MH:'Marshall Islands',
  MR:'Mauritania',MU:'Mauritius',MX:'Mexico',FM:'Micronesia',
  MD:'Moldova',MC:'Monaco',MN:'Mongolia',ME:'Montenegro',
  MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',NA:'Namibia',
  NR:'Nauru',NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',
  NI:'Nicaragua',NE:'Niger',NG:'Nigeria',NO:'Norway',
  OM:'Oman',PK:'Pakistan',PW:'Palau',PA:'Panama',
  PG:'Papua New Guinea',PY:'Paraguay',PE:'Peru',
  PH:'Philippines',PL:'Poland',PT:'Portugal',QA:'Qatar',
  RO:'Romania',RU:'Russia',RW:'Rwanda',KN:'Saint Kitts and Nevis',
  LC:'Saint Lucia',VC:'Saint Vincent and the Grenadines',
  WS:'Samoa',SM:'San Marino',ST:'Sao Tome and Principe',
  SA:'Saudi Arabia',SN:'Senegal',RS:'Serbia',SC:'Seychelles',
  SL:'Sierra Leone',SG:'Singapore',SK:'Slovakia',SI:'Slovenia',
  SB:'Solomon Islands',SO:'Somalia',ZA:'South Africa',
  SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',SD:'Sudan',
  SR:'Suriname',SE:'Sweden',CH:'Switzerland',SY:'Syria',
  TW:'Taiwan',TJ:'Tajikistan',TZ:'Tanzania',TH:'Thailand',
  TL:'Timor-Leste',TG:'Togo',TO:'Tonga',TT:'Trinidad and Tobago',
  TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',TV:'Tuvalu',
  UG:'Uganda',UA:'Ukraine',AE:'United Arab Emirates',
  GB:'United Kingdom',US:'United States',UY:'Uruguay',
  UZ:'Uzbekistan',VU:'Vanuatu',VE:'Venezuela',VN:'Vietnam',
  YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe'
};

// Try multiple variations of the location string to improve geocoding hit-rate.
// Returns the most populous match, which usually corresponds to the well-known place.
async function geocodeLocation(location) {
  const variants = [];
  variants.push(location.trim());
  if (location.includes(',')) {
    variants.push(location.split(',')[0].trim());
  }
  const words = location.trim().split(/\s+/);
  if (words.length > 1) {
    variants.push(words[0]);
  }
  const unique = [...new Set(variants)];
  for (const variant of unique) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(variant)}&count=10&language=en&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) continue;
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      // Prefer the most populous result (likely the famous one)
      const sorted = [...data.results].sort((a, b) => (b.population || 0) - (a.population || 0));
      return sorted[0];
    }
  }
  return null;
}

// --- OpenWeatherMap icon → emoji ------------------------------------------
// OWM returns icon codes like '01d', '10n' (suffix d/n for day/night).
const OWM_EMOJI = {
  '01d': '☀️',  '01n': '🌙',
  '02d': '🌤️', '02n': '🌤️',
  '03d': '⛅',  '03n': '⛅',
  '04d': '☁️',  '04n': '☁️',
  '09d': '🌧️', '09n': '🌧️',
  '10d': '🌦️', '10n': '🌦️',
  '11d': '⛈️', '11n': '⛈️',
  '13d': '❄️',  '13n': '❄️',
  '50d': '🌫️', '50n': '🌫️',
};
function iconToEmoji(icon) { return OWM_EMOJI[icon] || '🌤️'; }
function titleCase(str) {
  return (str || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

// GET /weather
//   - If ?lat & ?lon are provided    → OpenWeatherMap by coords
//   - Else if ?location is provided  → OpenWeatherMap by city query (q=)
// Returns a unified shape:
//   { location, temp, feels_like, condition, humidity, wind_speed,
//     high, low, uv_index, forecast: [{ day, emoji, high, low } x5] }
router.get('/', authenticate, async (req, res) => {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message: 'WEATHER_API_KEY is not configured on the server',
      });
    }

    const { lat, lon, location } = req.query;
    let base;
    if (lat && lon) {
      base = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    } else if (location) {
      base = `q=${encodeURIComponent(location)}`;
    } else {
      return res.status(400).json({ message: 'lat+lon or location is required' });
    }

    const currentUrl  = `https://api.openweathermap.org/data/2.5/weather?${base}&appid=${apiKey}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?${base}&appid=${apiKey}&units=metric`;

    const [curResp, fcResp] = await Promise.all([fetch(currentUrl), fetch(forecastUrl)]);

    if (!curResp.ok) {
      const status = curResp.status === 404 ? 404 : 502;
      const detail = await curResp.text().catch(() => '');
      return res.status(status).json({
        message: curResp.status === 404 ? 'Location not found' : 'Weather request failed',
        detail: detail.slice(0, 200),
      });
    }
    const cur = await curResp.json();
    const fc  = fcResp.ok ? await fcResp.json() : { list: [] };
    const data = { current: cur, forecast: fc };
    console.log('OWM raw response:', JSON.stringify(data));

    // Aggregate the 3-hour forecast slices into per-day buckets.
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDay = new Map(); // key: YYYY-MM-DD (local), val: { date, highs, lows, icons{}, noonIcon }
    (fc.list || []).forEach((entry) => {
      const d = new Date(entry.dt * 1000);
      const key = d.toISOString().slice(0, 10);
      if (!byDay.has(key)) {
        byDay.set(key, { date: d, highs: [], lows: [], icons: {}, noonIcon: null });
      }
      const bucket = byDay.get(key);
      if (entry.main && typeof entry.main.temp_max === 'number') bucket.highs.push(entry.main.temp_max);
      if (entry.main && typeof entry.main.temp_min === 'number') bucket.lows.push(entry.main.temp_min);
      const icon = entry.weather && entry.weather[0] && entry.weather[0].icon;
      if (icon) {
        bucket.icons[icon] = (bucket.icons[icon] || 0) + 1;
        const hour = d.getUTCHours();
        if (hour >= 11 && hour <= 14) bucket.noonIcon = icon;
      }
    });

    const forecast = Array.from(byDay.values()).slice(0, 5).map((b) => {
      // Prefer the icon nearest local noon; fall back to most frequent for the day.
      const topIcon = b.noonIcon
        || (Object.entries(b.icons).sort((a, c) => c[1] - a[1])[0] || [null])[0];
      return {
        day: DOW[b.date.getDay()],
        emoji: iconToEmoji(topIcon),
        high: b.highs.length ? Math.round(Math.max(...b.highs)) : null,
        low:  b.lows.length  ? Math.round(Math.min(...b.lows))  : null,
      };
    });

    // Today's high/low — prefer the forecast bucket for today, fall back to
    // the current-weather response's main.temp_min/temp_max.
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = byDay.get(todayKey);
    const high = today && today.highs.length
      ? Math.round(Math.max(...today.highs))
      : (cur.main && cur.main.temp_max != null ? Math.round(cur.main.temp_max) : null);
    const low = today && today.lows.length
      ? Math.round(Math.min(...today.lows))
      : (cur.main && cur.main.temp_min != null ? Math.round(cur.main.temp_min) : null);

    const countryCode = cur.sys.country;
    const countryName = COUNTRY_NAMES[countryCode] || countryCode;
    const locationString = `${cur.name}, ${countryName}`;

    const result = {
      location:   locationString,
      temp:       cur.main && cur.main.temp != null ? Math.round(cur.main.temp) : null,
      feels_like: cur.main && cur.main.feels_like != null ? Math.round(cur.main.feels_like) : null,
      condition:  titleCase((cur.weather && cur.weather[0] && cur.weather[0].description) || ''),
      humidity:   cur.main && cur.main.humidity != null ? cur.main.humidity : null,
      // OWM returns wind speed in m/s when units=metric; convert to km/h.
      wind_speed: cur.wind && typeof cur.wind.speed === 'number' ? Math.round(cur.wind.speed * 3.6) : null,
      high,
      low,
      // UV index requires OWM One Call 3.0 (paid) — null on the free tier.
      uv_index: null,
      forecast,
    };
    console.log('Weather route returning:', JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error('[Weather] Error:', error);
    res.status(500).json({ message: 'Error fetching weather: ' + error.message });
  }
});

// GET /weather/suggestions?location=X&startDate=Y&endDate=Z
// Returns weather-based packing suggestions
router.get('/suggestions', authenticate, async (req, res) => {
  try {
    const { location, startDate, endDate } = req.query;
    if (!location) {
      return res.status(400).json({ message: 'location is required' });
    }

    const place = await geocodeLocation(location);
    if (!place) {
      return res.status(404).json({ message: `Location "${location}" not found` });
    }
    const { latitude, longitude } = place;

    let forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16`;
    if (startDate && endDate) {
      forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&start_date=${startDate}&end_date=${endDate}&timezone=auto`;
    }
    const wxResp = await fetch(forecastUrl);
    const wxData = await wxResp.json();
    const daily = wxData.daily || {};

    const maxTemps = daily.temperature_2m_max || [];
    const minTemps = daily.temperature_2m_min || [];
    const precip = daily.precipitation_sum || [];
    const precipProb = daily.precipitation_probability_max || [];
    const windSpeed = daily.wind_speed_10m_max || [];

    const maxHigh = maxTemps.length ? Math.max(...maxTemps) : null;
    const minLow = minTemps.length ? Math.min(...minTemps) : null;
    const totalPrecip = precip.reduce((a, b) => a + (b || 0), 0);
    const maxPrecipProb = precipProb.length ? Math.max(...precipProb) : 0;
    const maxWind = windSpeed.length ? Math.max(...windSpeed) : 0;

    const suggestions = [];

    // Temperature-based
    if (minLow !== null && minLow < 0) {
      suggestions.push({ icon: '🧥', text: 'Heavy winter jacket (temps below freezing)', priority: 'high' });
      suggestions.push({ icon: '🧤', text: 'Thermal gloves and hat', priority: 'high' });
      suggestions.push({ icon: '🛏️', text: 'Sub-zero sleeping bag', priority: 'high' });
    } else if (minLow !== null && minLow < 10) {
      suggestions.push({ icon: '🧥', text: 'Warm jacket (cold nights)', priority: 'high' });
      suggestions.push({ icon: '🧦', text: 'Thermal base layers', priority: 'medium' });
    }
    if (maxHigh !== null && maxHigh > 28) {
      suggestions.push({ icon: '👕', text: 'Lightweight breathable clothing (hot days)', priority: 'high' });
      suggestions.push({ icon: '🧴', text: 'Extra sunscreen (SPF 30+)', priority: 'high' });
      suggestions.push({ icon: '💧', text: 'Extra water / hydration bladder', priority: 'high' });
      suggestions.push({ icon: '🧢', text: 'Wide-brim hat', priority: 'medium' });
    }

    // Precipitation-based
    if (maxPrecipProb > 60 || totalPrecip > 10) {
      suggestions.push({ icon: '🧥', text: 'Waterproof rain jacket', priority: 'high' });
      suggestions.push({ icon: '👖', text: 'Rain pants', priority: 'medium' });
      suggestions.push({ icon: '⛺', text: 'Tent with rainfly / tarp', priority: 'high' });
      suggestions.push({ icon: '🥾', text: 'Waterproof boots', priority: 'high' });
    } else if (maxPrecipProb > 30) {
      suggestions.push({ icon: '🧥', text: 'Light rain jacket (possible showers)', priority: 'medium' });
    }

    // Wind-based
    if (maxWind > 40) {
      suggestions.push({ icon: '🪢', text: 'Extra tent stakes and guy-lines (high winds)', priority: 'high' });
      suggestions.push({ icon: '🧥', text: 'Wind-resistant shell layer', priority: 'medium' });
    }

    // Always include
    suggestions.push({ icon: '🔦', text: 'Headlamp with extra batteries', priority: 'medium' });
    suggestions.push({ icon: '🩹', text: 'First-aid kit', priority: 'high' });

    res.json({
      summary: {
        highTempC: maxHigh,
        lowTempC: minLow,
        totalPrecipMm: Math.round(totalPrecip * 10) / 10,
        maxPrecipProbability: maxPrecipProb,
        maxWindKmh: maxWind
      },
      suggestions
    });
  } catch (error) {
    console.error('[Weather Suggestions] Error:', error);
    res.status(500).json({ message: 'Error: ' + error.message });
  }
});

module.exports = router;
