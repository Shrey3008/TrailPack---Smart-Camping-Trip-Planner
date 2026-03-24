# TrailPack - Smart Camping Trip Planner

A web-based SaaS tool that helps campers and backpackers plan trips by generating smart packing checklists based on terrain and season.

## Features

- **Trip Creation**: Create trips with name, terrain type, season, and duration
- **Smart Checklist Generator**: Automatically generates packing lists based on:
  - Terrain type (Mountain, Forest, Desert)
  - Season (Spring, Summer, Fall, Winter)
  - Trip duration
- **Packing Tracker**: Track packed items with checkboxes and progress indicator
- **Custom Items**: Add custom items to any checklist
- **Trip Management**: View all trips, check detailed checklists, and delete trips

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: MongoDB with Mongoose
- **Frontend**: HTML, CSS, JavaScript

## Project Structure

```
TrailPack/
├── backend/              # Node.js API
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── server.js        # Express server
│   ├── package.json     # Dependencies
│   └── .env.example     # Environment variables template
├── frontend/            # Static web pages
│   ├── index.html       # Dashboard
│   ├── create-trip.html # Trip creation form
│   ├── checklist.html   # Checklist view
│   ├── styles.css       # Styling
│   └── app.js           # Frontend logic
└── README.md
```

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your MongoDB connection string:
   ```
   MONGODB_URI=mongodb://localhost:27017/trailpack
   PORT=3000
   ```

5. Start the server:
   ```bash
   npm start
   # or for development with auto-restart:
   npm run dev
   ```

### Frontend Setup

The frontend is static HTML/CSS/JavaScript. You can:

1. Open the `frontend/index.html` file directly in a browser
2. Or use a local server like Live Server in VS Code

**Note**: The frontend expects the backend to be running on `http://localhost:3000`

## API Endpoints

### Trips
- `POST /trips` - Create a new trip (auto-generates checklist)
- `GET /trips` - Get all trips
- `GET /trips/:id` - Get a specific trip
- `DELETE /trips/:id` - Delete a trip and its checklist

### Checklist Items
- `GET /trips/:id/items` - Get all items for a trip
- `POST /items` - Add a custom item
- `PUT /items/:id` - Update packed status
- `DELETE /items/:id` - Delete an item

## Checklist Generation Rules

### Base Items (All Trips)
- Backpack
- Water bottle
- First aid kit
- Flashlight/Headlamp
- Whistle
- Map and compass

### Terrain Rules
- **Mountain**: Hiking boots, warm layers, trekking poles
- **Forest**: Bug spray, tarp, long pants
- **Desert**: Extra water containers, sun hat, sunscreen, sunglasses

### Season Rules
- **Winter**: Winter jacket, gloves, warm hat, insulated sleeping bag
- **Summer**: Lightweight clothing, cooling towel, lightweight tent
- **Fall/Spring**: Layered clothing, rain jacket, warm sleeping bag/waterproof boots

### Duration Rules
- **1+ days**: Tent, sleeping pad, camping stove, food supplies
- **3+ days**: Extra batteries, water purification tablets, multi-tool

## Deployment

### Backend (Render/Railway)
1. Push code to GitHub
2. Connect repository to Render or Railway
3. Add environment variables (MONGODB_URI)
4. Deploy

### Frontend (Netlify/Vercel)
1. Upload the `frontend` folder
2. Or connect GitHub repository
3. Deploy

### Database (MongoDB Atlas)
1. Create free cluster on MongoDB Atlas
2. Get connection string
3. Add to environment variables

## Author

**Patel Hetvi**

## License

MIT
