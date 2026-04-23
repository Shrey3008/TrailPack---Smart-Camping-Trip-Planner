// Profile JavaScript

// Load profile data
async function loadProfile() {
  try {
    const userData = await apiCallWithAuth('/auth/me');
    const user = userData.user;
    
    // Update form fields
    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-role').value = user.role || 'user';
    document.getElementById('profile-phone').value = user.profile?.phone || '';
    
    // Update stats
    document.getElementById('stat-total-trips').textContent = user.stats?.totalTrips || 0;
    document.getElementById('stat-completed').textContent = user.stats?.completedTrips || 0;
    document.getElementById('stat-items-packed').textContent = user.stats?.totalItemsPacked || 0;
    document.getElementById('stat-member-since').textContent = user.stats?.joinedAt 
      ? new Date(user.stats.joinedAt).toLocaleDateString() 
      : '-';
    
    // Update notification settings
    document.getElementById('email-notifications').checked = user.profile?.notificationSettings?.email !== false;
    document.getElementById('checklist-reminders').checked = user.profile?.notificationSettings?.checklistReminders !== false;
    
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
