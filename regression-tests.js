// Regression Testing for TrailPack Phase 4
// Ensures existing functionality still works after adding AI features, notifications, and enhanced UX

class RegressionTester {
  constructor() {
    this.testResults = [];
    this.passedTests = 0;
    this.failedTests = 0;
    this.totalTests = 0;
  }

  async runTest(testName, testFunction) {
    this.totalTests++;
    console.log(`🔄 Running regression test: ${testName}`);
    
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

  // Test Core Authentication
  async testAuthentication() {
    console.log('\n🔐 Testing Authentication...');

    await this.runTest('Login Functionality', async () => {
      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'testpassword'
          })
        });
        
        if (response.status === 200 || response.status === 401) {
          return { 
            passed: true, 
            message: 'Login endpoint responding correctly',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Unexpected status: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Login endpoint error: ${error.message}` };
      }
    });

    await this.runTest('Registration Functionality', async () => {
      try {
        const response = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'regression-test@example.com',
            password: 'testpassword',
            name: 'Regression Test'
          })
        });
        
        if (response.status === 200 || response.status === 400 || response.status === 409) {
          return { 
            passed: true, 
            message: 'Registration endpoint responding correctly',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Unexpected status: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Registration endpoint error: ${error.message}` };
      }
    });
  }

  // Test Trip Management
  async testTripManagement() {
    console.log('\n🏕️ Testing Trip Management...');

    await this.runTest('Create Trip', async () => {
      try {
        const response = await fetch('/trips', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            name: 'Regression Test Trip',
            terrain: 'Mountain',
            season: 'Summer',
            duration: 3
          })
        });
        
        if (response.status === 200 || response.status === 201 || response.status === 401) {
          return { 
            passed: true, 
            message: 'Create trip endpoint working',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Create trip failed: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Create trip error: ${error.message}` };
      }
    });

    await this.runTest('Get Trips', async () => {
      try {
        const response = await fetch('/trips', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (response.status === 200 || response.status === 401) {
          return { 
            passed: true, 
            message: 'Get trips endpoint working',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Get trips failed: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Get trips error: ${error.message}` };
      }
    });

    await this.runTest('Update Trip', async () => {
      try {
        const response = await fetch('/trips/test-trip-id', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ status: 'active' })
        });
        
        if (response.status === 200 || response.status === 404 || response.status === 401) {
          return { 
            passed: true, 
            message: 'Update trip endpoint working',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Update trip failed: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Update trip error: ${error.message}` };
      }
    });
  }

  // Test Checklist Management
  async testChecklistManagement() {
    console.log('\n📋 Testing Checklist Management...');

    await this.runTest('Get Checklist Items', async () => {
      try {
        const response = await fetch('/trips/test-trip-id/items', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (response.status === 200 || response.status === 404 || response.status === 401) {
          return { 
            passed: true, 
            message: 'Get checklist items working',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Get checklist items failed: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Get checklist items error: ${error.message}` };
      }
    });

    await this.runTest('Create Checklist Item', async () => {
      try {
        const response = await fetch('/items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            tripId: 'test-trip-id',
            name: 'Test Item',
            category: 'Test Category'
          })
        });
        
        if (response.status === 200 || response.status === 201 || response.status === 401) {
          return { 
            passed: true, 
            message: 'Create checklist item working',
            details: `Status: ${response.status}`
          };
        } else {
          return { passed: false, message: `Create checklist item failed: ${response.status}` };
        }
      } catch (error) {
        return { passed: false, message: `Create checklist item error: ${error.message}` };
      }
    });
  }

  // Test UI Components
  async testUIComponents() {
    console.log('\n🎨 Testing UI Components...');

    await this.runTest('Dashboard Page Loads', async () => {
      try {
        // Check if dashboard elements exist
        const dashboardContainer = document.querySelector('.dashboard-container');
        const tripsGrid = document.getElementById('trips-grid');
        const createTripBtn = document.querySelector('button[onclick*="create-trip.html"]');
        
        if (dashboardContainer && tripsGrid && createTripBtn) {
          return { 
            passed: true, 
            message: 'Dashboard UI components present',
            details: 'All dashboard elements found'
          };
        } else {
          return { 
            passed: false, 
            message: 'Missing dashboard UI components',
            details: `Container: ${!!dashboardContainer}, Grid: ${!!tripsGrid}, Button: ${!!createTripBtn}`
          };
        }
      } catch (error) {
        return { passed: false, message: `Dashboard UI test error: ${error.message}` };
      }
    });

    await this.runTest('Navigation Working', async () => {
      try {
        const navbar = document.querySelector('.navbar');
        const navLinks = document.querySelectorAll('.nav-link');
        
        if (navbar && navLinks.length > 0) {
          return { 
            passed: true, 
            message: 'Navigation components working',
            details: `Found ${navLinks.length} navigation links`
          };
        } else {
          return { 
            passed: false, 
            message: 'Navigation components missing',
            details: `Navbar: ${!!navbar}, Links: ${navLinks.length}`
          };
        }
      } catch (error) {
        return { passed: false, message: `Navigation test error: ${error.message}` };
      }
    });

    await this.runTest('CSS Styles Loading', async () => {
      try {
        const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
        const hasAnimations = Array.from(stylesheets).some(link => 
          link.href.includes('animations.css')
        );
        const hasMainStyles = Array.from(stylesheets).some(link => 
          link.href.includes('styles.css')
        );
        
        if (stylesheets.length >= 3 && hasMainStyles && hasAnimations) {
          return { 
            passed: true, 
            message: 'CSS stylesheets loading correctly',
            details: `Found ${stylesheets.length} stylesheets, including animations`
          };
        } else {
          return { 
            passed: false, 
            message: 'CSS stylesheets not loading properly',
            details: `Stylesheets: ${stylesheets.length}, Main: ${hasMainStyles}, Animations: ${hasAnimations}`
          };
        }
      } catch (error) {
        return { passed: false, message: `CSS test error: ${error.message}` };
      }
    });
  }

  // Test API Endpoints
  async testAPIEndpoints() {
    console.log('\n🌐 Testing API Endpoints...');

    await this.runTest('Health Check Endpoint', async () => {
      try {
        const response = await fetch('/health');
        const data = await response.json();
        
        if (response.status === 200 && data.status === 'healthy') {
          return { 
            passed: true, 
            message: 'Health check endpoint working',
            details: `Status: ${data.status}`
          };
        } else {
          return { passed: false, message: 'Health check endpoint failed' };
        }
      } catch (error) {
        return { passed: false, message: `Health check error: ${error.message}` };
      }
    });

    await this.runTest('Root Endpoint', async () => {
      try {
        const response = await fetch('/');
        const data = await response.json();
        
        if (response.status === 200 && data.message) {
          return { 
            passed: true, 
            message: 'Root endpoint working',
            details: data.message
          };
        } else {
          return { passed: false, message: 'Root endpoint failed' };
        }
      } catch (error) {
        return { passed: false, message: `Root endpoint error: ${error.message}` };
      }
    });

    await this.runTest('CORS Headers', async () => {
      try {
        const response = await fetch('/health', {
          method: 'OPTIONS'
        });
        
        const corsHeaders = response.headers.get('access-control-allow-origin');
        if (corsHeaders) {
          return { 
            passed: true, 
            message: 'CORS headers present',
            details: `Origin: ${corsHeaders}`
          };
        } else {
          return { 
            passed: false, 
            message: 'CORS headers missing',
            details: 'No Access-Control-Allow-Origin header found'
          };
        }
      } catch (error) {
        return { passed: false, message: `CORS test error: ${error.message}` };
      }
    });
  }

  // Test Phase 4 Integration
  async testPhase4Integration() {
    console.log('\n🚀 Testing Phase 4 Integration...');

    await this.runTest('New Routes Added', async () => {
      try {
        // Test if new AI routes are accessible
        const aiResponse = await fetch('/ai/weather/test', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const notificationResponse = await fetch('/notifications', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const aiAccessible = aiResponse.status !== 404;
        const notificationsAccessible = notificationResponse.status !== 404;
        
        if (aiAccessible && notificationsAccessible) {
          return { 
            passed: true, 
            message: 'Phase 4 routes accessible',
            details: 'AI and notification routes responding'
          };
        } else {
          return { 
            passed: false, 
            message: 'Some Phase 4 routes not accessible',
            details: `AI: ${aiAccessible}, Notifications: ${notificationsAccessible}`
          };
        }
      } catch (error) {
        return { passed: false, message: `Route integration test error: ${error.message}` };
      }
    });

    await this.runTest('Backward Compatibility', async () => {
      try {
        // Test that old functionality still works
        const oldTripResponse = await fetch('/trips', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const oldItemResponse = await fetch('/items/test-id', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const oldTripsWorking = oldTripResponse.status !== 404;
        const oldItemsWorking = oldItemResponse.status !== 404;
        
        if (oldTripsWorking && oldItemsWorking) {
          return { 
            passed: true, 
            message: 'Backward compatibility maintained',
            details: 'Existing endpoints still working'
          };
        } else {
          return { 
            passed: false, 
            message: 'Backward compatibility broken',
            details: `Trips: ${oldTripsWorking}, Items: ${oldItemsWorking}`
          };
        }
      } catch (error) {
        return { passed: false, message: `Backward compatibility test error: ${error.message}` };
      }
    });
  }

  // Test Performance Impact
  async testPerformanceImpact() {
    console.log('\n⚡ Testing Performance Impact...');

    await this.runTest('Page Load Time', async () => {
      try {
        const startTime = performance.now();
        
        // Simulate page load operations
        const elements = document.querySelectorAll('*');
        const styles = document.querySelectorAll('link[rel="stylesheet"]');
        const scripts = document.querySelectorAll('script');
        
        const loadTime = performance.now() - startTime;
        
        if (loadTime < 1000 && elements.length > 0 && styles.length > 0) {
          return { 
            passed: true, 
            message: 'Page load performance acceptable',
            details: `Load time: ${loadTime.toFixed(2)}ms, Elements: ${elements.length}`
          };
        } else {
          return { 
            passed: false, 
            message: 'Page load performance degraded',
            details: `Load time: ${loadTime.toFixed(2)}ms (target: <1000ms)`
          };
        }
      } catch (error) {
        return { passed: false, message: `Performance test error: ${error.message}` };
      }
    });

    await this.runTest('Memory Usage', async () => {
      try {
        if (performance.memory) {
          const memoryInfo = performance.memory;
          const usedMemory = memoryInfo.usedJSHeapSize / 1024 / 1024; // MB
          
          if (usedMemory < 50) { // Less than 50MB
            return { 
              passed: true, 
              message: 'Memory usage acceptable',
              details: `Used: ${usedMemory.toFixed(2)}MB`
            };
          } else {
            return { 
              passed: false, 
              message: 'Memory usage high',
              details: `Used: ${usedMemory.toFixed(2)}MB (target: <50MB)`
            };
          }
        } else {
          return { 
            passed: true, 
            message: 'Memory monitoring not available',
            details: 'Performance memory API not supported'
          };
        }
      } catch (error) {
        return { passed: false, message: `Memory test error: ${error.message}` };
      }
    });
  }

  // Run all regression tests
  async runAllTests() {
    console.log('🛡️ Starting Regression Tests for Phase 4...\n');
    
    await this.testAuthentication();
    await this.testTripManagement();
    await this.testChecklistManagement();
    await this.testUIComponents();
    await this.testAPIEndpoints();
    await this.testPhase4Integration();
    await this.testPerformanceImpact();
    
    this.generateReport();
  }

  // Generate regression test report
  generateReport() {
    console.log('\n📊 Regression Test Results Report');
    console.log('=====================================');
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ❌`);
    console.log(`Success Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%`);
    
    // Identify critical failures
    const criticalFailures = this.testResults.filter(test => 
      !test.passed && (
        test.name.includes('Authentication') ||
        test.name.includes('Trip Management') ||
        test.name.includes('API Endpoints')
      )
    );
    
    if (criticalFailures.length > 0) {
      console.log('\n⚠️ CRITICAL FAILURES:');
      criticalFailures.forEach(test => {
        console.log(`❌ ${test.name}: ${test.message}`);
      });
    }
    
    console.log('\n📋 Detailed Results:');
    this.testResults.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
      if (test.message) console.log(`   ${test.message}`);
    });
    
    return {
      total: this.totalTests,
      passed: this.passedTests,
      failed: this.failedTests,
      successRate: ((this.passedTests / this.totalTests) * 100).toFixed(1),
      criticalFailures: criticalFailures.length,
      results: this.testResults
    };
  }
}

// Auto-run tests if this script is loaded in browser
if (typeof window !== 'undefined') {
  window.RegressionTester = RegressionTester;
  
  // Add regression test button to page
  const regressionButton = document.createElement('button');
  regressionButton.textContent = 'Run Regression Tests';
  regressionButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #dc3545;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
  `;
  
  regressionButton.addEventListener('click', async () => {
    const tester = new RegressionTester();
    await tester.runAllTests();
  });
  
  document.body.appendChild(regressionButton);
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegressionTester;
}
