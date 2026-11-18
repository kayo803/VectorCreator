const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generate() {
  const svgPath = path.join(process.cwd(), 'public', 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Rendering icon-192.png...');
  await sharp(svgBuffer, { density: 300 })
    .resize(192, 192)
    .png()
    .toFile(path.join(process.cwd(), 'public', 'icon-192.png'));

  console.log('Rendering icon-512.png...');
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(path.join(process.cwd(), 'public', 'icon-512.png'));

  console.log('Icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
