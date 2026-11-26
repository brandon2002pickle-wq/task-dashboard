// Builds the hosted command centre (jarvis/index.html) from the same page source as the claude.ai artifact.
//   node dev/build-jarvis.js <path to command-centre index.html>
const fs = require('fs'), path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'jarvis', 'command-centre.src.html');
const page = fs.readFileSync(src, 'utf8');
fs.copyFileSync(src, path.join(__dirname, '..', 'jarvis', 'command-centre.src.html'));
const out = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07061a">
<link rel="manifest" href="manifest.webmanifest">
<title>J.A.R.V.I.S. Command Centre</title>
<link rel="icon" href="../icons/icon-192.png">
<script src="../config.js"></script>
<script src="hosted.js"></script>
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${page}
</body></html>
`;
fs.writeFileSync(path.join(__dirname, '..', 'jarvis', 'index.html'), out);
console.log('jarvis/index.html written (' + out.length + ' bytes)');
