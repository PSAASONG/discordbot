const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 Keepalive server berjalan di port ${port}`);
});
