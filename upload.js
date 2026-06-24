const fs = require('fs');

async function upload() {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjI3MDAyNDE1ODk0MjUiLCJrZXkiOiJlZDdkMzlhMmQzNTY3MDdjNDUzNTZhMjZiZjA0In0.uXb2qCvMrcHpIquIzcwAOkW9osA_bLLlmPB2Jv0_QDM';
  const fileBlob = new Blob([fs.readFileSync('bot.zip')], { type: 'application/zip' });
  
  const form = new FormData();
  form.append('file', fileBlob, 'bot.zip');

  console.log('Committing to Discloud...');
  const res = await fetch('https://api.discloud.app/v2/app/1782325956664/commit', {
    method: 'PUT',
    headers: {
      'api-token': token
    },
    body: form
  });

  const data = await res.json();
  console.log('Response:', data);
}

upload().catch(console.error);
