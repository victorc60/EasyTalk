// test_api.js - Test the horoscope API directly
const API_KEY = 'BTMjhid8pG7Wbykp2b8GRabYOrF46WxU1gQq9hge';
const API_BASE_URL = 'https://horoscope-app-api.vercel.app/api/v1';

async function testAPI() {
  console.log('🔮 Testing Horoscope API...\n');
  
  const signs = ['aries', 'taurus', 'gemini'];
  
  // Try different endpoint formats
  const endpoints = [
    `/get-horoscope/daily?sign={sign}&day=today`,
    `/horoscope/daily?sign={sign}`,
    `/daily-horoscope?sign={sign}`,
    `/horoscope?sign={sign}&day=today`,
    `/get-horoscope?sign={sign}&day=today`
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n🔍 Testing endpoint: ${endpoint}`);
    
    for (const sign of signs.slice(0, 1)) { // Test only first sign for each endpoint
      try {
        const url = `${API_BASE_URL}${endpoint.replace('{sign}', sign)}`;
        console.log(`📡 Testing: ${url}`);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`Status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Success! Response:`);
          console.log(JSON.stringify(data, null, 2));
          return; // Found working endpoint
        } else {
          const errorText = await response.text();
          console.log(`❌ Error: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        console.error(`Error:`, error.message);
      }
    }
  }
  
  console.log('\n❌ No working endpoint found. Trying without auth...');
  
  // Try without authentication
  for (const sign of signs.slice(0, 1)) {
    try {
      const url = `${API_BASE_URL}/get-horoscope/daily?sign=${sign}&day=today`;
      console.log(`📡 Testing without auth: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Success without auth! Response:`);
        console.log(JSON.stringify(data, null, 2));
        return;
      } else {
        const errorText = await response.text();
        console.log(`❌ Error: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error(`Error:`, error.message);
    }
  }
}

testAPI();
