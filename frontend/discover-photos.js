/* =============================================================================
   Discover destination photography — GENERATED FILE, DO NOT EDIT BY HAND.

   Regenerate with:  python3 tools/resolve-discover-photos.py

   One photograph per destination, each one actually of the place the card
   names. This replaced DISCOVER_PHOTO_POOL for these cards, which dealt a
   generic terrain stock photo per row index — that put the same image under
   two different park names in eight cases.

   26 of 40 come from the NPS API (federal works, so no credit needed) and
   14 from Wikimedia, which covers the USFS, state and municipal properties
   NPS does not know about, plus the two features whose only NPS entry would
   be their parent unit. Keys are the exact `name` from the DISCOVER_HOME_*
   lists in discover.js; a destination with no entry here falls back to the
   terrain tint panel rather than borrowing another place's photo.

   `credit: true` means the licence requires attribution and the card renders
   a credit strip. Public-domain files carry no such condition and set false.
   17 of 40 files here require attribution.
   ============================================================================= */
const DISCOVER_PLACE_PHOTOS = {
  'Yosemite National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C84CF74-1DD8-B71B-0B9C7FF83F7C68EB.jpg?width=640',
    by: 'NPS / Cindy Jacoby', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/yose/',
    credit: false
  },
  'Zion National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/68BFC1AC-BF96-629F-89D261D78F181C64.jpg?width=640',
    by: 'NPS Photo / Shane Carte', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/zion/',
    credit: false
  },
  'Acadia National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/D583EB46-F042-9F2A-FF92F9226DDB037D.jpg?width=640',
    by: 'Photo courtesy Emma Forthofer, Friends of Acadia', license: 'Courtesy photo (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/acad/',
    credit: true
  },
  'Glacier National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/C1C49B92-9BE9-6A08-F2C851A2A4ACEC8D.jpg?width=640',
    by: 'NPS Photo', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/glac/',
    credit: false
  },
  'Yellowstone National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/2815637A-9869-FC9C-99461D0B36AA1922.jpg?width=640',
    by: 'NPS / Jacob W. Frank', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/yell/',
    credit: false
  },
  'Grand Canyon National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/6C7F2214-CE4D-E366-A283BE0F4E65F83B.jpg?width=640',
    by: 'NPS/M. Quinn', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/grca/',
    credit: false
  },
  'Olympic National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C7B20CD-1DD8-B71B-0B9ACC145EFE6B99.jpg?width=640',
    by: 'NPS Photo/Bill Baccus', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/olym/',
    credit: false
  },
  'Sequoia National Park': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/General_Sherman_Tree_in_Sequoia_National_Park_-_June_2022.jpg/960px-General_Sherman_Tree_in_Sequoia_National_Park_-_June_2022.jpg',
    by: 'Marty Aligata', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:General_Sherman_Tree_in_Sequoia_National_Park_-_June_2022.jpg',
    credit: true
  },
  'Redwood National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/CD69DD56-E050-4F4E-DDF622317D38250E.jpg?width=640',
    by: 'NPS Photo / Steve Olson', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/redw/',
    credit: false
  },
  'Great Smoky Mountains': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C80EC37-1DD8-B71B-0B87F63E8B030D15.jpg?width=640',
    by: 'Kristina Plaas', license: 'Courtesy photo (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/grsm/',
    credit: true
  },
  'Shenandoah National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C80B539-1DD8-B71B-0BEAAA4AC31E7D5B.jpg?width=640',
    by: 'NPS Photo / Neal Lewis', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/shen/',
    credit: false
  },
  'Hoh Rainforest': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/BIG_LEAF_MAPLES_HOH.jpg/960px-BIG_LEAF_MAPLES_HOH.jpg',
    by: 'User:Doug Dolde', license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    page: 'https://commons.wikimedia.org/wiki/File:BIG_LEAF_MAPLES_HOH.jpg',
    credit: true
  },
  'Muir Woods': {
    src: 'https://www.nps.gov/common/uploads/structured_data/7961FEFE-AD2A-61A1-2CB953E4FDBD749D.jpg?width=640',
    by: 'NPS/ Jace Ritchey', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/muwo/',
    credit: false
  },
  'Congaree National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C862C60-1DD8-B71B-0BB65F7B652BA840.jpg?width=640',
    by: 'NPS', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/cong/',
    credit: false
  },
  'White Mountain National Forest': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Sandwich_Range.jpg/960px-Sandwich_Range.jpg',
    by: 'Ken Gallager', license: 'Public domain',
    licenseUrl: '',
    page: 'https://commons.wikimedia.org/wiki/File:Sandwich_Range.jpg',
    credit: false
  },
  'Pisgah National Forest': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Upper_Creek-27527-4.jpg/960px-Upper_Creek-27527-4.jpg',
    by: 'Ken Thomas', license: 'Public domain',
    licenseUrl: '',
    page: 'https://commons.wikimedia.org/wiki/File:Upper_Creek-27527-4.jpg',
    credit: false
  },
  'Rocky Mountain National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/0772DCB5-BDCF-0571-AEE80FA1F2590755.jpg?width=640',
    by: 'NPS Photo/R.Williams', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/romo/',
    credit: false
  },
  'Grand Teton National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/769E01AF-98C8-ECA3-7799030A09A7F685.jpg?width=640',
    by: 'NPS Photo/Tobiason', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/grte/',
    credit: false
  },
  'Mount Rainier National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/49F34094-B893-7DD6-5AE0F0220724B0EF.jpg?width=640',
    by: 'JD Hascup Photo', license: 'Courtesy photo (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/mora/',
    credit: true
  },
  'North Cascades National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C7A5CC2-1DD8-B71B-0BC0F615561921EE.jpg?width=640',
    by: 'NPS Photo/D. Dixon', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/noca/',
    credit: false
  },
  'Mount Whitney': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Mount_Whitney_2003-03-25.jpg/960px-Mount_Whitney_2003-03-25.jpg',
    by: 'Geographer ( talk · contribs )', license: 'CC BY 1.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/1.0',
    page: 'https://commons.wikimedia.org/wiki/File:Mount_Whitney_2003-03-25.jpg',
    credit: true
  },
  'Mount Hood': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Oregon_Mount_Hood_from_Trillium_Lake_2024.jpg/960px-Oregon_Mount_Hood_from_Trillium_Lake_2024.jpg',
    by: 'Kevin Crosby', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Oregon_Mount_Hood_from_Trillium_Lake_2024.jpg',
    credit: true
  },
  'Pikes Peak': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Beautiful_Image_of_Pikes_Peak_%28IMG_0136%29.jpg/960px-Beautiful_Image_of_Pikes_Peak_%28IMG_0136%29.jpg',
    by: 'Tokeamour', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Beautiful_Image_of_Pikes_Peak_(IMG_0136).jpg',
    credit: true
  },
  'Mount Washington': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/White_Mountains_12_30_09_81.jpg/960px-White_Mountains_12_30_09_81.jpg',
    by: 'Harvey Barrison', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
    page: 'https://commons.wikimedia.org/wiki/File:White_Mountains_12_30_09_81.jpg',
    credit: true
  },
  'Crater Lake National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C7B227E-1DD8-B71B-0BEECDD24771C381.jpg?width=640',
    by: 'NPS Photo', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/crla/',
    credit: false
  },
  'Lake Tahoe': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Tahoe_North_Shore_from_the_East_Shore.jpg/960px-Tahoe_North_Shore_from_the_East_Shore.jpg',
    by: 'Lara Farhadi', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Tahoe_North_Shore_from_the_East_Shore.jpg',
    credit: true
  },
  'Niagara Falls': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/3Falls_Niagara.jpg/960px-3Falls_Niagara.jpg',
    by: 'Saffron Blaze', license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    page: 'https://commons.wikimedia.org/wiki/File:3Falls_Niagara.jpg',
    credit: true
  },
  'Multnomah Falls': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Multnomah_Falls_on_2_August_2012.jpg/960px-Multnomah_Falls_on_2_August_2012.jpg',
    by: 'John Fowler from Placitas, NM, USA', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Multnomah_Falls_on_2_August_2012.jpg',
    credit: true
  },
  'Lake Powell': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Lake_Powell%2C_Near_Page_Arizona_%283449612604%29.jpg/960px-Lake_Powell%2C_Near_Page_Arizona_%283449612604%29.jpg',
    by: 'Alex Proimos from Sydney, Australia', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Lake_Powell,_Near_Page_Arizona_(3449612604).jpg',
    credit: true
  },
  'Lake of the Ozarks': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Lake_of_the_Ozarks%2C_MO_01.JPG/960px-Lake_of_the_Ozarks%2C_MO_01.JPG',
    by: 'Ben Jacobson ( Kranar Drogin )', license: 'CC BY 2.5',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.5',
    page: 'https://commons.wikimedia.org/wiki/File:Lake_of_the_Ozarks,_MO_01.JPG',
    credit: true
  },
  'Voyageurs National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/325E7D4A-919F-7E79-851567904D618FBF.jpg?width=640',
    by: 'Erik Fremstad', license: 'Courtesy photo (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/voya/',
    credit: true
  },
  'Apostle Islands': {
    src: 'https://www.nps.gov/common/uploads/structured_data/2E8C5E69-C194-1A0A-1DE7866FA06F95E1.jpg?width=640',
    by: 'NPS Photo / Billy Flynn', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/apis/',
    credit: false
  },
  'Death Valley National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/010A933C-95B1-CBCD-D6D64D47D5B81E76.jpg?width=640',
    by: 'Ronald Gaddis', license: 'Courtesy photo (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/deva/',
    credit: true
  },
  'Joshua Tree National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/306D0D93-9CCA-76E1-AD48268F8D7A7E3E.jpg?width=640',
    by: 'NPS / Emily Hassell', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/jotr/',
    credit: false
  },
  'Saguaro National Park': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Saguaro_Sunset.jpg/960px-Saguaro_Sunset.jpg',
    by: 'Saguaro Pictures', license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Saguaro_Sunset.jpg',
    credit: true
  },
  'Bryce Canyon National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/61F08520-E14F-18F2-BF5F3D89482631BD.jpg?width=640',
    by: 'NPS Photo / Peter Densmore', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/brca/',
    credit: false
  },
  'Arches National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/3C79931C-1DD8-B71B-0BF201E3DB540D04.jpg?width=640',
    by: 'NPS Photo', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/arch/',
    credit: false
  },
  'Big Bend National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/8BF8356B-BB63-76A4-19F5296EF94C96B4.jpg?width=640',
    by: 'NPS', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/bibe/',
    credit: false
  },
  'Canyonlands National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/D074F5CF-90A6-0468-24D18A9B669CC859.jpg?width=640',
    by: 'NPS/Rhodes Smartt', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/cany/',
    credit: false
  },
  'White Sands National Park': {
    src: 'https://www.nps.gov/common/uploads/structured_data/7CA16410-A412-1F05-2D92EB04EEB27980.jpg?width=640',
    by: 'NPS Photo', license: 'Public domain (NPS)',
    licenseUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
    page: 'https://www.nps.gov/whsa/',
    credit: false
  }
};
