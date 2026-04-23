const nodemailer = require('nodemailer');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const cron = require('node-cron');

class EmailService {
  constructor() {
    this.transporter = null;
    this.sesClient = null;
    this.initializeEmailService();
    this.setupScheduledNotifications();
  }

  // Initialize email service based on environment.
  // Returns silently (no transport configured) when credentials are missing or
  // when running in a test/no-email environment.
  initializeEmailService() {
    this.enabled = false;

    if (process.env.DISABLE_EMAIL === 'true' || process.env.NODE_ENV === 'test') {
      return; // Explicitly disabled — operate as a no-op.
    }

    // Prefer AWS SES when AWS credentials are present.
    if (process.env.AWS_SES_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.sesClient = new SESClient({
        region: process.env.AWS_SES_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      this.enabled = true;
      console.log('[email] Using AWS SES transport');
      return;
    }

    // Otherwise, Gmail/SMTP if credentials are provided.
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      this.enabled = true;
      console.log('[email] Using Gmail SMTP transport');
      return;
    }

    console.log('[email] No email credentials configured — emails will no-op.');
  }

  // Send email using the configured service. Returns { skipped: true } when
  // the service is not configured (development / tests) rather than throwing,
  // so callers can fire-and-forget without wrapping in try/catch.
  async sendEmail(to, subject, html, text = null) {
    const emailData = {
      from: process.env.EMAIL_FROM || 'noreply@trailpack.app',
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || this.htmlToText(html)
    };

    if (!this.enabled || (!this.sesClient && !this.transporter)) {
      return { skipped: true, reason: 'email service not configured', to: emailData.to, subject };
    }

    try {
      if (this.sesClient) return await this.sendSESEmail(emailData);
      if (this.transporter) return await this.sendSMTPEmail(emailData);
    } catch (error) {
      console.error('[email] send failed:', error.message);
      return { failed: true, error: error.message };
    }
  }

  // Send email using AWS SES
  async sendSESEmail(emailData) {
    const command = new SendEmailCommand({
      Source: emailData.from,
      Destination: {
        ToAddresses: emailData.to.split(', ').map(email => email.trim())
      },
      Message: {
        Subject: { Data: emailData.subject },
        Body: {
          Html: { Data: emailData.html },
          Text: { Data: emailData.text }
        }
      }
    });

    const result = await this.sesClient.send(command);
    return { messageId: result.MessageId };
  }

  // Send email using SMTP
  async sendSMTPEmail(emailData) {
    const result = await this.transporter.sendMail(emailData);
    return { messageId: result.messageId };
  }

  // Send trip reminder email
  async sendTripReminder(userEmail, tripDetails, daysUntil) {
    const subject = `Trip Reminder: ${tripDetails.name} in ${daysUntil} days!`;
    const html = this.generateTripReminderHTML(tripDetails, daysUntil);

    const result = await this.sendEmail(userEmail, subject, html);
    console.log(`[email] Trip reminder dispatched to ${userEmail} for trip ${tripDetails.name}`);
    return result;
  }

  // Send weather alert email
  async sendWeatherAlert(userEmail, tripDetails, weatherData) {
    const subject = `Weather Alert for ${tripDetails.name}`;
    const html = this.generateWeatherAlertHTML(tripDetails, weatherData);
    
    await this.sendEmail(userEmail, subject, html);
    console.log(`Weather alert sent to ${userEmail} for trip ${tripDetails.name}`);
  }

  // Send checklist completion email
  async sendChecklistCompletion(userEmail, tripDetails, progress) {
    const subject = `Checklist Progress Update: ${tripDetails.name}`;
    const html = this.generateChecklistProgressHTML(tripDetails, progress);
    
    await this.sendEmail(userEmail, subject, html);
    console.log(`Checklist progress sent to ${userEmail} for trip ${tripDetails.name}`);
  }

  // Send trip sharing invitation
  async sendTripInvitation(userEmail, tripDetails, inviterName, joinLink) {
    const subject = `You're invited to join: ${tripDetails.name}`;
    const html = this.generateTripInvitationHTML(tripDetails, inviterName, joinLink);
    
    await this.sendEmail(userEmail, subject, html);
    console.log(`Trip invitation sent to ${userEmail} for trip ${tripDetails.name}`);
  }

  // Send welcome email
  async sendWelcomeEmail(userEmail, userName) {
    const subject = 'Welcome to TrailPack! 🏕️';
    const html = this.generateWelcomeHTML(userName);
    
    await this.sendEmail(userEmail, subject, html);
    console.log(`Welcome email sent to ${userEmail}`);
  }

  // Generate HTML for trip reminder
  generateTripReminderHTML(tripDetails, daysUntil) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .trip-details { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .cta-button { display: inline-block; background: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏕️ Trip Reminder</h1>
            <p>Your adventure is just around the corner!</p>
          </div>
          <div class="content">
            <h2>${tripDetails.name}</h2>
            <div class="trip-details">
              <p><strong>⏰ Time until departure:</strong> ${daysUntil} days</p>
              <p><strong>📍 Location:</strong> ${tripDetails.location || 'Not specified'}</p>
              <p><strong>🏔️ Terrain:</strong> ${tripDetails.terrain}</p>
              <p><strong>📅 Duration:</strong> ${tripDetails.duration} days</p>
              <p><strong>🌤️ Season:</strong> ${tripDetails.season}</p>
            </div>
            <p>It's time to finalize your preparations! Make sure your checklist is complete and you have all the necessary gear.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/index.html" class="cta-button">View Your Trip</a>
            <p>Check the weather forecast and review your route before you leave. Have a fantastic trip!</p>
          </div>
          <div class="footer">
            <p>TrailPack - Your Smart Camping Companion</p>
            <p>Too many emails? <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings">Manage notifications</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate HTML for weather alert
  generateWeatherAlertHTML(tripDetails, weatherData) {
    const alerts = weatherData.alerts || [];
    const hasWarnings = alerts.length > 0;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${hasWarnings ? '#e74c3c' : '#f39c12'}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .alert { background: ${hasWarnings ? '#e74c3c' : '#f39c12'}; color: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .weather-info { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .cta-button { display: inline-block; background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🌤️ Weather Alert</h1>
            <p>Important weather update for your trip</p>
          </div>
          <div class="content">
            <h2>${tripDetails.name}</h2>
            ${hasWarnings ? alerts.map(alert => `
              <div class="alert">
                <strong>⚠️ ${alert.event}</strong>
                <p>${alert.description}</p>
              </div>
            `).join('') : ''}
            <div class="weather-info">
              <h3>Weather Forecast:</h3>
              ${weatherData.predictions?.slice(0, 5).map(day => `
                <p><strong>${day.date.toLocaleDateString()}:</strong> ${day.temperature}°C, ${day.description}, ${day.precipitation}% rain</p>
              `).join('') || '<p>Weather data temporarily unavailable</p>'}
            </div>
            <p>Make sure you're prepared for these conditions. Check your gear and consider adjusting your plans if necessary.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/index.html" class="cta-button">Review Your Trip</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate HTML for checklist progress
  generateChecklistProgressHTML(tripDetails, progress) {
    const percentage = Math.round((progress.packed / progress.total) * 100);
    const isComplete = percentage === 100;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${isComplete ? '#27ae60' : '#3498db'}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .progress-bar { background: #ecf0f1; border-radius: 10px; overflow: hidden; margin: 10px 0; }
          .progress-fill { background: ${isComplete ? '#27ae60' : '#3498db'}; height: 20px; transition: width 0.3s; }
          .stats { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; text-align: center; }
          .cta-button { display: inline-block; background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Checklist Progress</h1>
            <p>${isComplete ? 'All packed and ready!' : 'Keep going!'}</p>
          </div>
          <div class="content">
            <h2>${tripDetails.name}</h2>
            <div class="stats">
              <h3>${progress.packed} / ${progress.total} items packed</h3>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
              </div>
              <p><strong>${percentage}% Complete</strong></p>
            </div>
            ${isComplete ? 
              '<p>🎉 Excellent! You\'re fully packed and ready for your adventure. Double-check everything and have an amazing trip!</p>' :
              `<p>You're making great progress! ${progress.total - progress.packed} items remaining. Don't forget the essentials!</p>`
            }
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/checklist.html?trip=${tripDetails.id}" class="cta-button">View Checklist</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate HTML for trip invitation
  generateTripInvitationHTML(tripDetails, inviterName, joinLink) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #9b59b6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .trip-details { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .cta-button { display: inline-block; background: #9b59b6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 You're Invited!</h1>
            <p>Join an amazing camping adventure</p>
          </div>
          <div class="content">
            <h2>${tripDetails.name}</h2>
            <p><strong>${inviterName}</strong> has invited you to join this camping trip!</p>
            <div class="trip-details">
              <p><strong>📍 Location:</strong> ${tripDetails.location || 'Not specified'}</p>
              <p><strong>🏔️ Terrain:</strong> ${tripDetails.terrain}</p>
              <p><strong>📅 Duration:</strong> ${tripDetails.duration} days</p>
              <p><strong>🌤️ Season:</strong> ${tripDetails.season}</p>
            </div>
            <p>Click below to accept the invitation and start collaborating on the trip planning!</p>
            <a href="${joinLink}" class="cta-button">Accept Invitation</a>
            <p>This link will expire in 7 days. If you can't join, no worries - just ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate HTML for welcome email
  generateWelcomeHTML(userName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2ecc71; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .feature { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .cta-button { display: inline-block; background: #2ecc71; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏕️ Welcome to TrailPack!</h1>
            <p>Your smart camping trip planner is ready</p>
          </div>
          <div class="content">
            <h2>Hi ${userName}!</h2>
            <p>Welcome to TrailPack! We're excited to help you plan amazing camping adventures. Here's what you can do:</p>
            <div class="feature">
              <h3>📋 Smart Checklists</h3>
              <p>Get AI-powered packing lists tailored to your trip's terrain, season, and duration.</p>
            </div>
            <div class="feature">
              <h3>🌤️ Weather Insights</h3>
              <p>Receive weather forecasts and AI-powered recommendations for your destination.</p>
            </div>
            <div class="feature">
              <h3>👥 Trip Sharing</h3>
              <p>Collaborate with friends and family on trip planning and checklists.</p>
            </div>
            <div class="feature">
              <h3>🗺️ Route Planning</h3>
              <p>Optimize your hiking routes with AI-powered insights and elevation data.</p>
            </div>
            <p>Ready to start your first adventure?</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/index.html" class="cta-button">Plan Your First Trip</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Setup scheduled notifications. Disabled by default so tests / dev don't
  // trigger side effects. Set ENABLE_EMAIL_SCHEDULER=true to opt in.
  setupScheduledNotifications() {
    if (process.env.ENABLE_EMAIL_SCHEDULER !== 'true') {
      return;
    }

    cron.schedule('0 9 * * *', async () => {
      console.log('[email] Running scheduled trip reminders...');
      await this.checkTripReminders();
    });

    cron.schedule('0 */6 * * *', async () => {
      console.log('[email] Running scheduled weather alerts...');
      await this.checkWeatherAlerts();
    });
  }

  // Scan for trips whose startDate falls on day N from today and send reminders
  // to their owners. Defaults to reminders at 7, 3, and 1 day out.
  async checkTripReminders(windowsDays = [7, 3, 1]) {
    try {
      // Late-require to avoid circular deps at module load.
      const docClient = require('../db.js');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      const res = await docClient.send(new ScanCommand({
        TableName: process.env.DYNAMODB_TABLE_NAME,
        FilterExpression: 'begins_with(SK, :sk) AND attribute_exists(startDate)',
        ExpressionAttributeValues: { ':sk': 'TRIP#' },
      }));
      const trips = res.Items || [];

      const results = [];
      for (const trip of trips) {
        const daysUntil = daysBetweenTodayAnd(trip.startDate);
        if (daysUntil === null) continue;
        if (!windowsDays.includes(daysUntil)) continue;

        const owner = await lookupUserById(trip.userId);
        if (!owner || !owner.email) continue;

        const sent = await this.sendTripReminder(owner.email, { ...trip, id: trip.tripId }, daysUntil);
        results.push({ tripId: trip.tripId, daysUntil, sent });
      }
      return results;
    } catch (error) {
      console.error('[email] checkTripReminders failed:', error.message);
      return [];
    }
  }

  // Placeholder: future wiring to OpenWeather alerts per trip location.
  async checkWeatherAlerts() {
    console.log('[email] checkWeatherAlerts is not yet implemented.');
    return [];
  }

  // Convert HTML to plain text
  htmlToText(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}

// ---------- Module-level helpers (outside the class) ----------

// Compute whole-day difference between today (UTC) and a given date string.
// Returns null when the date is missing/invalid.
function daysBetweenTodayAnd(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const midnightNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const midnightTarget = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((midnightTarget - midnightNow) / (24 * 60 * 60 * 1000));
}

async function lookupUserById(userId) {
  try {
    const docClient = require('../db.js');
    const { GetCommand } = require('@aws-sdk/lib-dynamodb');
    const usersTable = process.env.DYNAMODB_USERS_TABLE || 'TrailPack-Users';
    const res = await docClient.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    return res.Item || null;
  } catch (e) {
    console.warn('[email] lookupUserById failed:', e.message);
    return null;
  }
}

const singleton = new EmailService();
// Expose helpers for tests.
singleton._internals = { daysBetweenTodayAnd };

module.exports = singleton;
