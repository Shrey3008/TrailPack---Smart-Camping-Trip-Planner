# Product Requirements Document (PRD)

**Product Name:** TrailPack (MVP Version)  
**Prepared By:** Patel Hetvi  
**Date:** March 2026

---

## 1. Product Overview

TrailPack is a web-based SaaS tool that helps campers and backpackers plan trips by generating smart packing checklists based on terrain and season. The MVP focuses on preventing overpacking and missing essential gear through a simple, rule-based system.

---

## 2. Problem Statement

Users often:
- Forget essential gear
- Overpack unnecessary items
- Fail to adjust for terrain or season

This MVP solves that by providing a simple, automated checklist system.

---

## 3. MVP Scope (What WILL Be Built)

### ✅ Included Features
- Trip creation
- Rule-based checklist generator
- Packing tracker (checkbox system)
- Trip saving (database)
- Basic dashboard (view trips)

### ❌ Excluded (Future Enhancements)
- Weather API integration
- AI risk analysis
- Group collaboration
- Calorie/water estimator
- Printable export

---

## 4. Target Users
- Beginner campers
- Students/new backpackers
- Users planning short trips

---

## 5. Core Features & Requirements

### 5.1 Trip Creation

**Description:** Users create a trip with basic details.

**Inputs:**
- Trip Name (text)
- Terrain Type (dropdown): Mountain, Forest, Desert
- Season (dropdown): Spring, Summer, Fall, Winter
- Duration (number of days)

**Requirements:**
- All fields required
- Form validation (no empty values)
- Save trip to database

### 5.2 Rule-Based Checklist Generator

**Description:** System generates a checklist based on predefined rules.

**Checklist Categories:**
- Clothing
- Shelter
- Food & Water
- Safety
- Tools

**Sample Logic (MVP Rules):**

Base Items (all trips):
- Backpack
- Water bottle
- First aid kit

Terrain Rules:
- Mountain → Hiking boots, warm layers
- Forest → Bug spray, tarp
- Desert → Extra water, sun protection

Season Rules:
- Winter → Jacket, gloves
- Summer → Light clothing, sunscreen
- Fall/Spring → Layered clothing

**Requirements:**
- Runs automatically after trip creation
- Items stored in database linked to trip
- Users can add/remove custom items

### 5.3 Packing Tracker

**Description:** Users track packed items via checklist.

**Features:**
- Checkbox for each item
- "Packed" status stored in database
- Progress indicator (e.g., 6/10 items packed)

**Requirements:**
- Real-time updates
- State persists after refresh

### 5.4 Dashboard (Trip Management)

**Description:** Main page displaying all user trips.

**Features:**
- List of trips
- Click to view checklist
- Delete trip

**Requirements:**
- Fetch trips from database
- Simple UI (list or cards)

---

## 6. User Flow

1. User opens app
2. User creates a trip
3. System generates checklist
4. User views checklist
5. User checks off packed items
6. User returns later → progress saved

---

## 7. UI Pages (MVP)

### 1. Dashboard
- List of trips
- "Create Trip" button

### 2. Create Trip Page
- Form inputs
- Submit button

### 3. Checklist Page
- Trip details (name, terrain, season)
- Categorized checklist
- Checkboxes

---

## 8. Data Model

### User (Optional for MVP)
- id
- email
- password

*(Note: Auth can be skipped for MVP)*

### Trip
- id
- name
- terrain
- season
- duration
- created_at

### ChecklistItem
- id
- trip_id
- name
- category
- packed (boolean)

---

## 9. Tech Stack (Simple & Buildable)

### Frontend
- HTML, CSS, JavaScript (or React if comfortable)

### Backend
- Node.js + Express

### Database
- MongoDB (easiest for MVP)

---

## 10. API Endpoints

### Trips
- POST /trips → create trip
- GET /trips → get all trips
- GET /trips/:id → get single trip
- DELETE /trips/:id → delete trip

### Checklist
- GET /trips/:id/items
- PUT /items/:id → update packed status
- POST /items → add custom item

---

## 11. Edge Cases

- Empty form submission → show error
- No checklist items → fallback to base items
- Refresh page → data persists
- Deleting trip → deletes checklist items

---

## 12. Deployment Plan

- **Frontend:** Vercel or Netlify
- **Backend:** Render or Railway
- **Database:** MongoDB Atlas

---

## 13. Testing Plan

- Create trip → verify saved
- Checklist generates correctly
- Check/uncheck items → persists
- Delete trip → removed from DB

---

## 14. Success Criteria (MVP)

- User can create a trip
- Checklist auto-generates
- Items can be checked off
- Data persists after refresh
- App runs without crashes

---

## 15. Future Roadmap (Post-MVP)

- Weather-based recommendations
- AI risk analysis
- Group packing
- Export to PDF
- Mobile responsiveness improvements
