// FinBot v4 API Test Script
const http = require('http');

// Test currency conversion
const testCurrencyConversion = () => {
  const postData = JSON.stringify({
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    amount: 100
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/currency/convert',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('💱 Currency Conversion Test:');
      console.log(JSON.parse(data));
      console.log('');
      testAIInsights();
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
};

// Test AI insights
const testAIInsights = () => {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/analytics/insights/1',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('🧠 AI Insights Test:');
      const insights = JSON.parse(data);
      insights.insights.forEach((insight, index) => {
        console.log(`${index + 1}. ${insight.title}`);
        console.log(`   ${insight.description}`);
        console.log(`   Impact: ${insight.impact}, Confidence: ${Math.round(insight.confidence * 100)}%`);
      });
      console.log('');
      testExchangeRates();
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.end();
};

// Test exchange rates
const testExchangeRates = () => {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/exchange-rates?from=USD&to=TRY',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('📈 Exchange Rate Test (USD to TRY):');
      console.log(JSON.parse(data));
      console.log('');
      console.log('✅ All API tests completed successfully!');
      console.log('🌐 Open http://localhost:3001 in your browser to see the dashboard');
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.end();
};

// Start tests
console.log('🚀 Testing FinBot v4 Demo APIs...\n');
testCurrencyConversion();