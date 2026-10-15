import {randomUUID} from 'node:crypto';
import {readFile,writeFile,stat,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import ExcelJS from 'exceljs';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {createWorker} from 'tesseract.js';
import {pythonOperation} from './python.mjs';
import {runBrowser} from './browser.mjs';
import {runSkill} from './forge.mjs';

const require=createRequire(import.meta.url);
const languages=require('@tesseract.js-data/eng');
export const text=(value,max=12000)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('TEXT_INVALID');return value.trim();
};
export function decodeUpload({data,format},allowed){
 if(!allowed.includes(format)||typeof data!=='string'||data.length>14000000||!/^[a-zA-Z0-9+/]*={0,2}$/.test(data))throw Error('UPLOAD_INVALID');
 const bytes=Buffer.from(data,'base64');
 if(!bytes.length||bytes.length>10000000)throw Error('UPLOAD_SIZE_INVALID');
 if(format==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('IMAGE_FORMAT_INVALID');
 if(format==='jpg'&&(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255))throw Error('IMAGE_FORMAT_INVALID');
 return bytes;
}
export function createActions({dataDir,store,python,modelDir,chromePath,allowLoopbackForTests=false}={}){
 const artifact=async(extension,make)=>{
  const id=randomUUID()+'.'+extension,path=resolve(dataDir,'artifacts',id);
  await make(path);
  const bytes=await readFile(path);
  return {artifact:store.saveArtifact({id,bytes:bytes.length,filename:'VAOS-report.'+extension})};
 };
 return async function execute(kind,input,{signal,stage=()=>{}}={}){
  stage('Running '+kind);
  if(kind==='document.create'){
   const title=text(input.title,200),body=text(input.body);
   if(input.format==='docx')return artifact('docx',path=>pythonOperation('document.word',{title,body,output:path},{python,signal}));
   if(input.format==='xlsx')return artifact('xlsx',async path=>{
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Report');
    sheet.addRow([title]);sheet.getRow(1).font={bold:true,size:16};
    for(const line of body.split('\n'))sheet.addRow(line.split('\t'));
    sheet.columns.forEach(col=>{col.width=32;});
    await workbook.xlsx.writeFile(path);
   });
   if(input.format==='pdf')return artifact('pdf',async path=>{
    const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
    let page=pdf.addPage(),y=790;
    // Standard PDF fonts support Latin text. Unsupported characters fail visibly.
    const lines=[title,'',...body.split('\n').flatMap(line=>line.match(/.{1,85}(?:\s|$)|.{1,85}/g)||[''])];
    for(const line of lines){if(y<40){page=pdf.addPage();y=790;}page.drawText(line,{x:40,y,size:11,font,color:rgb(.08,.09,.1)});y-=17;}
    await writeFile(path,await pdf.save());
   });
   throw Error('DOCUMENT_FORMAT_INVALID');
  }
  if(kind==='image.ocr'){
   const image=decodeUpload(input,['png','jpg']);
   const worker=await createWorker('eng',1,{langPath:languages.langPath,cachePath:resolve(dataDir,'ocr-cache'),logger:()=>{}});
   const abort=()=>void worker.terminate();signal?.addEventListener('abort',abort,{once:true});
   try{if(signal?.aborted)throw Error('CANCELLED');const result=await worker.recognize(image);return {text:result.data.text.slice(0,16000),confidence:result.data.confidence};}
   finally{signal?.removeEventListener('abort',abort);await worker.terminate().catch(()=>{});}
  }
  if(kind==='voice.transcribe'){
   const bytes=decodeUpload(input,['wav','webm','ogg']);
   const path=resolve(dataDir,'uploads',randomUUID()+'.'+input.format);
   await writeFile(path,bytes);
   try{return await pythonOperation(kind,{audio:path,model:modelDir},{python,signal,timeout:180000});}
   finally{await unlink(path).catch(()=>{});}
  }
  if(kind==='browser.research'||kind==='browser.workflow'){
   const id=randomUUID()+'.bin',path=resolve(dataDir,'artifacts',id);
   const result=await runBrowser({...input,steps:kind==='browser.research'?[]:input.steps},{signal,artifactPath:path,artifactId:id,executablePath:chromePath,allowLoopbackForTests});
   if(result.download){const size=(await stat(path)).size;if(size>10000000){await unlink(path);throw Error('DOWNLOAD_TOO_LARGE');}result.artifact=store.saveArtifact({...result.download,bytes:size});}
   return result;
  }
  if(kind==='desktop.action')return pythonOperation(kind,input,{python,signal,timeout:15000});
  if(kind==='memory.briefing'){
   const rows=store.memories();
   return {text:rows.length?rows.map(r=>r.title+'\n'+r.body).join('\n\n').slice(0,16000):'No saved memories yet.'};
  }
  if(kind==='skill.run'){
   const skill=store.skills().find(s=>s.id===input.id&&s.state==='approved');
   if(!skill)throw Error('SKILL_NOT_APPROVED');
   return {text:runSkill(skill.definition,input.text)};
  }
  throw Error('OPERATION_NOT_SUPPORTED');
 };
}
