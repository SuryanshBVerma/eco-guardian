const https = require('https');

const postData = JSON.stringify({
  version: "0.26.1", // some vscode version, wait, query via package name
  package: {
    name: "ms-python.python",
    ecosystem: "VSCode"
  }
});

const options = {
  hostname: 'api.osv.dev',
  path: '/v1/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
req.write(postData);
req.end();
