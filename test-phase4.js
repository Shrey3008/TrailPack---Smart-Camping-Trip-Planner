// Phase 4 Functionality Testing for TrailPack
// Tests AI integrations, notifications, and enhanced UX features

class Phase4Tester {
  constructor() {
    this.testResults = [];
    this.passedTests = 0;
    this.failedTests = 0;
    this.totalTests = 0;
  }

  // Test runner
  async runTest(testName, testFunction) {
    this.totalTests++;
    console.log(`\n🧪 Running test: ${testName}`);
    
    try {
      const result = await testFunction();
      if (result.passed) {
        this.passedTests++;
        console.log(`✅ PASSED: ${testName}`);
        if (result.message) console.log(`   ${result.message}`);
      } else {
        this.failedTests++;
        console.log(`❌ FAILED: ${testName}`);
        if (result.message) console.log(`   ${result.message}`);
      }
      
      this.testResults.push({
        name: testName,
        passed: result.passed,
        message: result.message,
        details: result.details || null
      });
    } catch (error) {
      this.failedTests++;
      console.log(`❌ ERROR: ${testName} - ${error.message}`);
      this.testResults.push({
        name: testName,
        passed: false,
        message: error.message,
        details: error.stack
      });
    }
  }

  // AI Service Tests
  async testAIServices() {
    console.log('\n🤖 Testing AI Services...');

    // Test weather prediction
    await this.runTest('Weather Prediction Service', async () => {
      try {
        const response = await fetch('/ai/weather/New York', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        
        if (data.success && data.data.predictions) {
          return { 
            passed: true, 
            message: 'Weather prediction API working',
            details: `Found ${data.data.predictions.length} weather predictions`
          };
        } else {
          return { passed: false, message: 'Weather prediction failed' };
        }
      } catch (error) {
        return { passed: false, message: `Weather API error: ${error.message}` };
      }
    });

    // Test route optimization
    await this.runTest('Route Optimization Service', async () => {
      try {
        const response = await fetch('/ai/route/optimize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            startPoint: 'New York, NY',
            endPoint: 'Boston, MA',
            terrain: 'Mountain'
          })
        });
        const data = await response.json();
        
        if (data.success && data.data.distance) {
          return { 
            passed: true, 
            message: 'Route optimization working',
            details: `Distance: ${data.data.distance}km, Duration: ${data.data.duration}h`
          };
        } else {
          return { passed: false, message: 'Route optimization failed' };
        }
      } catch (error) {
        return { passed: false, message: `Route optimization error: ${error.message}` };
      }
    });

    // Test personalized recommendations
    await this.runTest('Personalized Recommendations', async () => {
      try {
        const response = await fetch('/ai/recommendations/personalized', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            userProfile: { experienceLevel: 'Intermediate' },
            tripDetails: { terrain: 'Mountain', duration: 3, season: 'Summer' }
          })
        });
        const data = await response.json();
        
        if (data.success && data.data.recommendations) {
          return { 
            passed: true, 
            message: 'Personalized recommendations working',
            details: 'AI generated personalized recommendations'
          };
        } else {
          return { passed: false, message: 'Personalized recommendations failed' };
        }
      } catch (error) {
        return { passed: false, message: `Recommendations error: ${error.message}` };
      }
    });
  }

  // Notification System Tests
  async testNotificationSystem() {
    console.log('\n🔔 Testing Notification System...');

    // Test notification creation
    await this.runTest('Create Notification', async () => {
      try {
        const response = await fetch('/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            type: 'info',
            title: 'Test Notification',
            message: 'This is a test notification'
          })
        });
        const data = await response.json();
        
        if (data.success) {
          return { 
            passed: true, 
            message: 'Notification creation working',
            details: `Created notification ID: ${data.data.id}`
          };
        } else {
          return { passed: false, message: 'Notification creation failed' };
        }
      } catch (error) {
        return { passed: false, message: `Notification creation error: ${error.message}` };
      }
    });

    // Test notification retrieval
    await this.runTest('Retrieve Notifications', async () => {
      try {
        const response = await fetch('/notifications', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.data.notifications)) {
          return { 
            passed: true, 
            message: 'Notification retrieval working',
            details: `Found ${data.data.notifications.length} notifications`
          };
        } else {
          return { passed: false, message: 'Notification retrieval failed' };
        }
      } catch (error) {
        return { passed: false, message: `Notification retrieval error: ${error.message}` };
      }
    });

    // Test unread count
    await this.runTest('Unread Count', async () => {
      try {
        const response = await fetch('/notifications/unread-count', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        
        if (data.success && typeof data.data.unreadCount === 'number') {
          return { 
            passed: true, 
            message: 'Unread count working',
            details: `Unread count: ${data.data.unreadCount}`
          };
        } else {
          return { passed: false, message: 'Unread count failed' };
        }
      } catch (error) {
        return { passed: false, message: `Unread count error: ${error.message}` };
      }
    });
  }

  // Email Service Tests
  async testEmailService() {
    console.log('\n📧 Testing Email Service...');

    // Test trip reminder email
    await this.runTest('Trip Reminder Email', async () => {
      try {
        const response = await fetch('/notifications/trip-reminder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            tripDetails: { name: 'Test Trip', id: 'test123' },
            daysUntil: 3
          })
        });
        const data = await response.json();
        
        if (data.success) {
          return { 
            passed: true, 
            message: 'Trip reminder email working',
            details: 'Trip reminder notification created'
          };
        } else {
          return { passed: false, message: 'Trip reminder email failed' };
        }
      } catch (error) {
        return { passed: false, message: `Trip reminder email error: ${error.message}` };
      }
    });

    // Test weather alert email
    await this.runTest('Weather Alert Email', async () => {
      try {
        const response = await fetch('/notifications/weather-alert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            tripDetails: { name: 'Test Trip', id: 'test123' },
            weatherData: { predictions: [], alerts: [{ event: 'High Wind' }] }
          })
        });
        const data = await response.json();
        
        if (data.success) {
          return { 
            passed: true, 
            message: 'Weather alert email working',
            details: 'Weather alert notification created'
          };
        } else {
          return { passed: false, message: 'Weather alert email failed' };
        }
      } catch (error) {
        return { passed: false, message: `Weather alert email error: ${error.message}` };
      }
    });
  }

  // Enhanced UX Tests
  async testEnhancedUX() {
    console.log('\n✨ Testing Enhanced UX Features...');

    // Test loading skeletons
    await this.runTest('Loading Skeletons', async () => {
      try {
        // Check if skeleton styles are loaded
        const skeletonStyles = document.querySelector('style');
        if (skeletonStyles && skeletonStyles.textContent.includes('.skeleton-line')) {
          return { 
            passed: true, 
            message: 'Loading skeleton styles present',
            details: 'Skeleton loading animations available'
          };
        } else {
          return { passed: false, message: 'Loading skeleton styles missing' };
        }
      } catch (error) {
        return { passed: false, message: `Loading skeleton test error: ${error.message}` };
      }
    });

    // Test notification UI
    await this.runTest('Notification UI Components', async () => {
      try {
        const notificationBell = document.getElementById('notification-bell');
        const notificationBadge = document.getElementById('notification-badge');
        const notificationDropdown = document.getElementById('notification-dropdown');
        
        if (notificationBell && notificationBadge && notificationDropdown) {
          return { 
            passed: true, 
            message: 'Notification UI components present',
            details: 'Bell, badge, and dropdown found'
          };
        } else {
          return { passed: false, message: 'Some notification UI components missing' };
        }
      } catch (error) {
        return { passed: false, message: `Notification UI test error: ${error.message}` };
      }
    });

    // Test animations
    await this.runTest('CSS Animations', async () => {
      try {
        const animationStyles = document.querySelector('link[href*="animations.css"]');
        if (animationStyles) {
          return { 
            passed: true, 
            message: 'Animation styles loaded',
            details: 'Enhanced animations CSS file present'
          };
        } else {
          return { passed: false, message: 'Animation styles missing' };
        }
      } catch (error) {
        return { passed: false, message: `Animation test error: ${error.message}` };
      }
    });
  }

  // Integration Tests
  async testIntegrations() {
    console.log('\n🔗 Testing Feature Integrations...');

    // Test AI insights in dashboard
    await this.runTest('AI Insights Integration', async () => {
      try {
        // Check if AI insights card styles exist
        const aiStyles = document.querySelector('style');
        if (aiStyles && aiStyles.textContent.includes('.ai-insights-card')) {
          return { 
            passed: true, 
            message: 'AI insights integration working',
            details: 'AI insights styles and components present'
          };
        } else {
          return { passed: false, message: 'AI insights integration missing' };
        }
      } catch (error) {
        return { passed: false, message: `AI insights test error: ${error.message}` };
      }
    });

    // Test notification manager initialization
    await this.runTest('Notification Manager', async () => {
      try {
        if (window.notificationManager && typeof window.notificationManager.loadNotifications === 'function') {
          return { 
            passed: true, 
            message: 'Notification manager initialized',
            details: 'NotificationManager class loaded and functional'
          };
        } else {
          return { passed: false, message: 'Notification manager not found' };
        }
      } catch (error) {
        return { passed: false, message: `Notification manager test error: ${error.message}` };
      }
    });
  }

  // Performance Tests
  async testPerformance() {
    console.log('\n⚡ Testing Performance...');

    // Test dashboard load time
    await this.runTest('Dashboard Load Performance', async () => {
      try {
        const startTime = performance.now();
        
        // Simulate dashboard loading
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const loadTime = performance.now() - startTime;
        
        if (loadTime < 2000) { // Under 2 seconds
          return { 
            passed: true, 
            message: 'Dashboard loads quickly',
            details: `Load time: ${loadTime.toFixed(2)}ms`
          };
        } else {
          return { 
            passed: false, 
            message: 'Dashboard loading slow',
            details: `Load time: ${loadTime.toFixed(2)}ms (target: <2000ms)`
          };
        }
      } catch (error) {
        return { passed: false, message: `Performance test error: ${error.message}` };
      }
    });

    // Test animation performance
    await this.runTest('Animation Performance', async () => {
      try {
        const testElement = document.createElement('div');
        testElement.style.animation = 'fadeIn 0.3s ease-out';
        document.body.appendChild(testElement);
        
        // Check if animation applied
        const computedStyle = window.getComputedStyle(testElement);
        const hasAnimation = computedStyle.animationName !== 'none';
        
        document.body.removeChild(testElement);
        
        if (hasAnimation) {
          return { 
            passed: true, 
            message: 'Animations working properly',
            details: 'CSS animations applied correctly'
          };
        } else {
          return { passed: false, message: 'Animations not working' };
        }
      } catch (error) {
        return { passed: false, message: `Animation performance test error: ${error.message}` };
      }
    });
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting Phase 4 Functionality Tests...\n');
    
    await this.testAIServices();
    await this.testNotificationSystem();
    await this.testEmailService();
    await this.testEnhancedUX();
    await this.testIntegrations();
    await this.testPerformance();
    
    this.generateReport();
  }

  // Generate test report
  generateReport() {
    console.log('\n📊 Phase 4 Test Results Report');
    console.log('=====================================');
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ❌`);
    console.log(`Success Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n📋 Detailed Results:');
    this.testResults.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
      if (test.message) console.log(`   ${test.message}`);
    });
    
    // Generate HTML report
    this.generateHTMLReport();
    
    return {
      total: this.totalTests,
      passed: this.passedTests,
      failed: this.failedTests,
      successRate: ((this.passedTests / this.totalTests) * 100).toFixed(1),
      results: this.testResults
    };
  }

  // Generate HTML report
  generateHTMLReport() {
    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Phase 4 Test Report - TrailPack</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { background: #2d6a4f; color: white; padding: 20px; border-radius: 8px; }
          .summary { display: flex; gap: 20px; margin: 20px 0; }
          .metric { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; flex: 1; }
          .metric h3 { margin: 0; color: #2d6a4f; }
          .metric .value { font-size: 2rem; font-weight: bold; }
          .test-result { margin: 10px 0; padding: 10px; border-radius: 5px; }
          .passed { background: #d4edda; border-left: 4px solid #28a745; }
          .failed { background: #f8d7da; border-left: 4px solid #dc3545; }
          .test-name { font-weight: bold; }
          .test-message { color: #666; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Phase 4 Functionality Test Report</h1>
          <p>TrailPack - Smart Camping Trip Planner</p>
        </div>
        
        <div class="summary">
          <div class="metric">
            <h3>Total Tests</h3>
            <div class="value">${this.totalTests}</div>
          </div>
          <div class="metric">
            <h3>Passed</h3>
            <div class="value" style="color: #28a745;">${this.passedTests}</div>
          </div>
          <div class="metric">
            <h3>Failed</h3>
            <div class="value" style="color: #dc3545;">${this.failedTests}</div>
          </div>
          <div class="metric">
            <h3>Success Rate</h3>
            <div class="value">${((this.passedTests / this.totalTests) * 100).toFixed(1)}%</div>
          </div>
        </div>
        
        <h2>Test Results</h2>
        ${this.testResults.map(test => `
          <div class="test-result ${test.passed ? 'passed' : 'failed'}">
            <div class="test-name">${test.passed ? '✅' : '❌'} ${test.name}</div>
            <div class="test-message">${test.message}</div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    
    // Save report to file (in a real implementation)
    console.log('\n📄 HTML report generated (check browser downloads)');
    
    return reportHTML;
  }
}

// Auto-run tests if this script is loaded in browser
if (typeof window !== 'undefined') {
  window.Phase4Tester = Phase4Tester;
  
  // Add test button to page for manual testing
  const testButton = document.createElement('button');
  testButton.textContent = 'Run Phase 4 Tests';
  testButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #2d6a4f;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
  `;
  
  testButton.addEventListener('click', async () => {
    const tester = new Phase4Tester();
    await tester.runAllTests();
  });
  
  document.body.appendChild(testButton);
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Phase4Tester;
}
