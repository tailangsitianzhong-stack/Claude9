// dist/ のビルド結果を 1 枚の HTML（artifact/index.html）にまとめる。
// Artifact は <html>/<head>/<body> を自動で付けるので、中身だけを書き出す。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link[^>]+href="\.\/(assets\/[^"]+\.css)"[^>]*>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
const js = [...html.matchAll(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
if (!css.length || !js.length) throw new Error('dist/index.html から CSS/JS が見つかりません。先に npm run build を実行してください。');

const safeJs = js.join('\n').replace(/<\/script/gi, '<\\/script');
const out = `<title>ストロー工場タイクーン</title>
<meta name="theme-color" content="#bfe3ff">
<style>
${css.join('\n')}
</style>
<div id="app"></div>
<div id="hud"></div>
<script type="module">
${safeJs}
</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', out);
console.log(`artifact/index.html (${(out.length / 1024).toFixed(0)} KB)`);
