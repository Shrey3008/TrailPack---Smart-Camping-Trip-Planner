// Profile JavaScript

// Write to an element only if the page actually has it.
//
// These helpers exist because a single missing element used to take the whole
// profile down with it. loadProfile() wrote to `stat-completed` and
// `stat-member-since`, neither of which exists in profile.html — so
// getElementById returned null, assigning to .textContent on null threw, and
// every line after it was skipped. The visible result was a profile page that
// reported "Gear Items 0" for an account with items packed, and notification
// checkboxes that never reflected saved settings, while the only clue was a
// console error and a generic "Failed to load profile data".
//
// Populating a display field is not worth aborting a page over, so a field the
// markup does not have is now a no-op rather than a thrown TypeError.
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
  return Boolean(el);
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
  return Boolean(el);
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = value;
  return Boolean(el);
}

// Load profile data
async function loadProfile() {
  try {
    const userData = await apiCallWithAuth('/auth/me');
    const user = userData.user;

    // Update form fields
    setValue('profile-name', user.name || '');
    setValue('profile-email', user.email || '');
    setValue('profile-role', user.role || 'user');
    setValue('profile-phone', user.profile?.phone || '');

    // Update stats.
    //
    // Only the tiles this page actually renders. The former writes to
    // `stat-completed` and `stat-member-since` are gone rather than guarded:
    // there is no completed-trips tile in the markup, and "member since" is
    // already rendered into #hero-since by the inline script in profile.html,
    // in a friendlier format than this did. `stat-shared-trips` is likewise
    // filled there, from the shared-trips endpoint this response has no count
    // for.
    setText('stat-total-trips', user.stats?.totalTrips || 0);
    setText('stat-items-packed', user.stats?.totalItemsPacked || 0);

    // Update notification settings
    setChecked('email-notifications', user.profile?.notificationSettings?.email !== false);
    setChecked('checklist-reminders', user.profile?.notificationSettings?.checklistReminders !== false);

  } catch (error) {
    console.error('Error loading profile:', error);
    showMessage('profile-message', 'Failed to load profile data', 'error');
  }
}

// Handle profile form submission
document.addEventListener('DOMContentLoaded', () => {
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('profile-name').value;
      const phone = document.getElementById('profile-phone').value;
      
      try {
        await apiCallWithAuth('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ name, phone })
        });
        
        // Update stored user data (sessionStorage mirrors what login writes).
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        user.name = name;
        sessionStorage.setItem('currentUser', JSON.stringify(user));

        showMessage('profile-message', 'Profile updated successfully', 'success');
        if (window.showToast) window.showToast('Profile updated.', 'success', 2000);
      } catch (error) {
        console.error('Error updating profile:', error);
        showMessage('profile-message', 'Failed to update profile', 'error');
      }
    });
  }
  
  // Handle password form
  const passwordForm = document.getElementById('password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmNewPassword = document.getElementById('confirm-new-password').value;
      
      // Validation
      if (newPassword !== confirmNewPassword) {
        showMessage('password-message', 'New passwords do not match', 'error');
        return;
      }
      
      if (newPassword.length < 6) {
        showMessage('password-message', 'New password must be at least 6 characters', 'error');
        return;
      }
      
      try {
        await apiCallWithAuth('/auth/password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword, newPassword })
        });
        
        // Clear form
        passwordForm.reset();
        
        showMessage('password-message', 'Password changed successfully', 'success');
      } catch (error) {
        console.error('Error changing password:', error);
        showMessage('password-message', error.message || 'Failed to change password', 'error');
      }
    });
  }
  
  // Handle notification settings form
  const notificationForm = document.getElementById('notification-form');
  if (notificationForm) {
    notificationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const emailNotifications = document.getElementById('email-notifications').checked;
      const checklistReminders = document.getElementById('checklist-reminders').checked;
      
      try {
        await apiCallWithAuth('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({
            notificationSettings: {
              email: emailNotifications,
              checklistReminders: checklistReminders
            }
          })
        });
        
        showMessage('notification-message', 'Notification settings saved', 'success');
      } catch (error) {
        console.error('Error saving settings:', error);
        showMessage('notification-message', 'Failed to save settings', 'error');
      }
    });
  }
});

// Show message helper
function showMessage(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
}
