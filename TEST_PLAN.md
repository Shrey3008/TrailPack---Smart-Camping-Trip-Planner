# TrailPack Phase 3 - Validation & Regression Test Plan

## Test Environment Setup

**Backend URL:** http://localhost:3000
**Frontend Path:** c:\Users\Mansi Patel\Downloads\TrailPack-dev\frontend

---

## PHASE 1: VALIDATION TESTING

### 1. Authentication Tests

#### Test 1.1: User Registration
**Endpoint:** `POST /api/auth/register`
**Test Data:**
```json
{
  "name": "Test User",
  "email": "testuser@example.com",
  "password": "TestPass123!"
}
```
**Expected Results:**
- [ ] Returns 201 status
- [ ] Returns JWT token
- [ ] Returns user object with role "user"
- [ ] Password is hashed (not returned)

#### Test 1.2: User Login
**Endpoint:** `POST /api/auth/login`
**Test Data:**
```json
{
  "email": "testuser@example.com",
  "password": "TestPass123!"
}
```
**Expected Results:**
- [ ] Returns 200 status
- [ ] Returns JWT token
- [ ] Returns user object
- [ ] Token is valid for subsequent requests

#### Test 1.3: Invalid Login
**Endpoint:** `POST /api/auth/login`
**Test Data:**
```json
{
  "email": "testuser@example.com",
  "password": "wrongpassword"
}
```
**Expected Results:**
- [ ] Returns 401 status
- [ ] Returns error message

#### Test 1.4: Protected Route Access
**Endpoint:** `GET /api/trips` (without token)
**Expected Results:**
- [ ] Returns 401 status
- [ ] Error message about authentication required

#### Test 1.5: Token Validation
**Endpoint:** `GET /api/trips` (with valid token)
**Expected Results:**
- [ ] Returns 200 status
- [ ] Returns trips data

---

### 2. Role Management Tests

#### Test 2.1: Default Role Assignment
**Action:** Register new user
**Expected:**
- [ ] New user has role "user" by default

#### Test 2.2: Role-Based Access - Admin Only
**Endpoint:** `GET /api/trips/admin/dashboard`
**Test with user role:**
- [ ] Returns 403 Forbidden

**Test with admin role:**
- [ ] Returns 200 with dashboard data

#### Test 2.3: Change User Role (Admin)
**Endpoint:** `PUT /api/auth/users/{userId}/role`
**Test Data:**
```json
{
  "role": "organizer"
}
```
**Expected Results:**
- [ ] Admin can change role
- [ ] User role is updated in database
- [ ] Returns updated user object

#### Test 2.4: Deactivate User (Admin)
**Endpoint:** `PUT /api/auth/users/{userId}/status`
**Test Data:**
```json
{
  "isActive": false
}
```
**Expected Results:**
- [ ] User is deactivated
- [ ] Deactivated user cannot login

---

### 3. Dashboard Business Logic Tests

#### Test 3.1: Dashboard Stats Calculation
**Endpoint:** `GET /api/trips/dashboard/stats`
**Expected Results:**
- [ ] Returns totalTrips count
- [ ] Returns activeTrips count
- [ ] Returns completedTrips count
- [ ] Returns overallProgress percentage

#### Test 3.2: Terrain Distribution
**Endpoint:** `GET /api/trips/dashboard/stats`
**Expected Results:**
- [ ] Returns terrainStats object
- [ ] Contains counts for each terrain type
- [ ] Percentages calculate correctly

#### Test 3.3: Season Distribution
**Endpoint:** `GET /api/trips/dashboard/stats`
**Expected Results:**
- [ ] Returns seasonStats object
- [ ] Contains counts for each season
- [ ] Percentages calculate correctly

#### Test 3.4: Recent Trips
**Endpoint:** `GET /api/trips/dashboard/stats`
**Expected Results:**
- [ ] Returns recentTrips array (last 5)
- [ ] Each trip has progress percentage
- [ ] Sorted by creation date (newest first)

#### Test 3.5: Upcoming Trips
**Endpoint:** `GET /api/trips/dashboard/stats`
**Expected Results:**
- [ ] Returns upcomingTrips array
- [ ] Only trips with future startDate
- [ ] Sorted by startDate (earliest first)
- [ ] Includes daysUntil calculation

---

### 4. Admin Dashboard Tests

#### Test 4.1: Admin Dashboard Stats
**Endpoint:** `GET /api/trips/admin/dashboard`
**Expected Results:**
- [ ] Returns totalUsers count
- [ ] Returns totalTrips count
- [ ] Returns totalItems count
- [ ] Returns newUsers (last 30 days)
- [ ] Returns newTrips (last 30 days)

#### Test 4.2: Role Distribution
**Endpoint:** `GET /api/trips/admin/dashboard`
**Expected Results:**
- [ ] Returns roleDistribution array
- [ ] Shows count for each role (admin, organizer, user)

#### Test 4.3: Trip Status Distribution
**Endpoint:** `GET /api/trips/admin/dashboard`
**Expected Results:**
- [ ] Returns tripStatusDistribution array
- [ ] Shows count for each status (planning, active, completed, cancelled)

#### Test 4.4: Top Users List
**Endpoint:** `GET /api/trips/admin/dashboard`
**Expected Results:**
- [ ] Returns topUsers array
- [ ] Users sorted by activity (trips + items packed)
- [ ] Limited to top 10 users

---

## PHASE 2: REGRESSION TESTING

### 5. Core Trip Features

#### Test 5.1: Create Trip
**Endpoint:** `POST /api/trips`
**Test Data:**
```json
{
  "name": "Mountain Adventure",
  "terrain": "Mountain",
  "season": "Summer",
  "duration": 3,
  "startDate": "2024-07-15",
  "endDate": "2024-07-18"
}
```
**Expected Results:**
- [ ] Returns 201 status
- [ ] Trip is created with userId
- [ ] Status is "planning" by default
- [ ] Auto-generates checklist items

#### Test 5.2: Get All Trips
**Endpoint:** `GET /api/trips`
**Expected Results:**
- [ ] Returns 200 status
- [ ] Returns only user's trips (not others)
- [ ] Pagination works if implemented

#### Test 5.3: Get Single Trip
**Endpoint:** `GET /api/trips/{tripId}`
**Expected Results:**
- [ ] Returns 200 with trip data
- [ ] Returns 404 for non-existent trip
- [ ] Returns 403 for other user's trip

#### Test 5.4: Update Trip
**Endpoint:** `PUT /api/trips/{tripId}`
**Test Data:**
```json
{
  "name": "Updated Trip Name",
  "status": "active"
}
```
**Expected Results:**
- [ ] Returns 200 with updated trip
- [ ] Only owner can update
- [ ] Status changes work correctly

#### Test 5.5: Delete Trip
**Endpoint:** `DELETE /api/trips/{tripId}`
**Expected Results:**
- [ ] Returns 200 status
- [ ] Trip and associated items deleted
- [ ] Only owner can delete

---

### 6. Checklist Item Features

#### Test 6.1: Get Checklist Items
**Endpoint:** `GET /api/trips/{tripId}/items`
**Expected Results:**
- [ ] Returns 200 with items array
- [ ] Items organized by category

#### Test 6.2: Toggle Item Status
**Endpoint:** `PUT /api/items/{itemId}`
**Test Data:**
```json
{
  "packed": true
}
```
**Expected Results:**
- [ ] Returns 200 with updated item
- [ ] packed status is updated
- [ ] Trip progress updates automatically

#### Test 6.3: Add Custom Item
**Endpoint:** `POST /api/items`
**Test Data:**
```json
{
  "tripId": "trip-id-here",
  "name": "Custom Item",
  "category": "Tools"
}
```
**Expected Results:**
- [ ] Returns 201 with new item
- [ ] Item appears in checklist
- [ ] Category is valid

#### Test 6.4: Delete Item
**Endpoint:** `DELETE /api/items/{itemId}`
**Expected Results:**
- [ ] Returns 200 status
- [ ] Item is removed from checklist
- [ ] Only owner of trip can delete

---

### 7. Smart Recommendations

#### Test 7.1: Get Recommendations
**Endpoint:** `GET /api/trips/{tripId}/recommendations`
**Expected Results:**
- [ ] Returns 200 with recommendations array
- [ ] Each recommendation has type and message
- [ ] Types: warning, success, info, suggestion

#### Test 7.2: Critical Items Warning
**Setup:** Create trip without essential items
**Expected:**
- [ ] Shows warning for missing critical items
- [ ] Suggests specific items to add

---

### 8. User Profile Features

#### Test 8.1: Get Profile
**Endpoint:** `GET /api/auth/me`
**Expected Results:**
- [ ] Returns 200 with user data
- [ ] Includes profile info and stats
- [ ] Does not include password

#### Test 8.2: Update Profile
**Endpoint:** `PUT /api/auth/profile`
**Test Data:**
```json
{
  "name": "Updated Name",
  "phone": "123-456-7890",
  "notificationSettings": {
    "email": true,
    "checklistReminders": false
  }
}
```
**Expected Results:**
- [ ] Returns 200 with updated profile
- [ ] Changes are persisted

#### Test 8.3: Change Password
**Endpoint:** `PUT /api/auth/password`
**Test Data:**
```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}
```
**Expected Results:**
- [ ] Returns 200 on success
- [ ] Returns 400 if current password wrong
- [ ] New password works for login

---

## Test Execution Summary

| Test Category | Total Tests | Passed | Failed | Status |
|---------------|-------------|--------|--------|--------|
| Authentication | 5 | - | - | Pending |
| Role Management | 4 | - | - | Pending |
| Dashboard | 5 | - | - | Pending |
| Admin Dashboard | 4 | - | - | Pending |
| Core Trip Features | 5 | - | - | Pending |
| Checklist Items | 4 | - | - | Pending |
| Recommendations | 2 | - | - | Pending |
| User Profile | 3 | - | - | Pending |
| **TOTAL** | **32** | **-** | **-** | **Pending** |

---

## How to Run Tests

### Option 1: Manual Testing with curl/Postman
```bash
# Example: Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"test123"}'
```

### Option 2: Automated Testing (if Jest is configured)
```bash
cd backend
npm test
```

### Option 3: Frontend Testing
1. Open `frontend/login.html` in browser
2. Test each feature through UI
3. Check browser console for errors

---

## Notes

- All timestamps should be in ISO 8601 format
- All IDs are MongoDB ObjectIds (24 character hex strings)
- JWT tokens expire after 24 hours
- CORS is configured for localhost:8080 (frontend)
