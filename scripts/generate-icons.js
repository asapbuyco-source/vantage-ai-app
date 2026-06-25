import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '../public/icons/icon-512.png');

const androidSizes = [
  { dir: 'mipmap-mdpi',    size: 48 },
  { dir: 'mipmap-hdpi',    size: 72 },
  { dir: 'mipmap-xhdpi',   size: 96 },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const androidRes = path.join(__dirname, '../android/app/src/main/res');

async function generate() {
  console.log('🎨 Generating Android icons from:', src);
  
  for (const { dir, size } of androidSizes) {
    const outDir = path.join(androidRes, dir);

    await sharp(src).resize(size, size).png().toFile(path.join(outDir, 'ic_launcher.png'));
    console.log(`✅ ${dir}/ic_launcher.png (${size}x${size})`);

    await sharp(src).resize(size, size).png().toFile(path.join(outDir, 'ic_launcher_round.png'));
    console.log(`✅ ${dir}/ic_launcher_round.png`);

    const fgSize = Math.round(size * 1.5);
    const padding = Math.round((fgSize - size) / 2);
    await sharp(src)
      .resize(size, size)
      .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(fgSize, fgSize)
      .png()
      .toFile(path.join(outDir, 'ic_launcher_foreground.png'));
    console.log(`✅ ${dir}/ic_launcher_foreground.png`);
  }

  // Splash screen: centered logo on dark background
  const splashDir = path.join(androidRes, 'drawable');
  const splashSize = 288;
  const splashCanvas = 1200;
  const splashPad = Math.round((splashCanvas - splashSize) / 2);
  await sharp(src)
    .resize(splashSize, splashSize)
    .extend({ top: splashPad, bottom: splashPad, left: splashPad, right: splashPad, background: { r: 10, g: 14, b: 25, alpha: 1 } })
    .png()
    .toFile(path.join(splashDir, 'splash.png'));
  console.log('✅ drawable/splash.png (splash screen)');

  console.log('\n🎉 All icons generated!');
}

generate().catch(err => { console.error('❌', err.message); process.exit(1); });
