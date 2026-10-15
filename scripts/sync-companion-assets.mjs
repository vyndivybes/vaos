import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/companion/package.json',import.meta.url));
const root=fileURLToPath(new URL('../',import.meta.url));
const threeRoot=resolve(dirname(require.resolve('three')),'..');
const target=resolve(root,'apps/web/vendor');await mkdir(target,{recursive:true});
for(const filename of ['three.module.min.js','three.core.min.js'])await copyFile(resolve(threeRoot,'build',filename),resolve(target,filename));
await copyFile(resolve(threeRoot,'LICENSE'),resolve(target,'THREE-LICENSE.txt'));
// Keep exact dependency licenses alongside the companion distribution.
const notices=resolve(root,'apps/companion/licenses');await mkdir(notices,{recursive:true});
for(const [name,license] of [['exceljs','LICENSE'],['pdf-lib','LICENSE.md'],['playwright','LICENSE'],['tesseract.js','LICENSE.md']]){
 const dir=dirname(require.resolve(name+'/package.json'));
 await copyFile(resolve(dir,license),resolve(notices,name.replaceAll('/','-')+'.txt'));
}
console.log('Companion browser assets and third-party license notices synchronized.');
