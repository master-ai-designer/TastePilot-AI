import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app=express();
app.use(express.json());
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const publicDir=path.join(__dirname,"public");
app.use(express.static(publicDir));
app.get("/",(req,res)=>res.sendFile(path.join(publicDir,"index.html")));

function chatReply(message){
 const q=message.toLowerCase();
 const has=(...words)=>words.some(w=>q.includes(w));
 if(has("salom","hello","hi","hey")) return "Salom! 👋 Men TastePilot. Anime, film, musiqa, restoran, joy yoki boshqa tajriba haqida istagingizni yozing.";
 if(has("anime","animeni","animega")) return "Albatta 🎬 Sizga anime topib beraman. Masalan, janrni ayting: romantika, komediya, action, school life yoki happy ending. Xohlasangiz men mos variantlarni keyingi bosqichda Qloo orqali ham tekshiraman.";
 if(has("film","movie","kino","serial")) return "Zo‘r 🎬 Qanday film yoki serial qidiryapsiz? Janr, kayfiyat yoki yoqtirgan filmingizni yozing. Masalan: “yomg‘irli kechada ko‘rishga romantik film”.";
 if(has("musiqa","music","playlist","qo‘shiq","song")) return "🎧 Kayfiyatingizni ayting — masalan “sokin tungi musiqa” yoki “energetik gym playlist”. TastePilot shu signal asosida mos yo‘nalishni aniqlaydi.";
 if(has("restoran","restaurant","ovqat","dinner","kafe","cafe","taom")) return "🍽️ Qaysi shahar yoki hudud? Masalan: “Toshkentda sokin romantik dinner uchun joy”. Shunda tavsiyani aniqroq qilamiz.";
 if(has("nima ko‘ray","nima ko'ray","tavsiya","recommend","topib ber","qidir")) return "😊 Albatta. Menga 2–3 ta istagingizni yozing: masalan “romantik + kulgili + happy ending”. Men uni taste signalga aylantirib, mos tavsiyalarni tayyorlashga yordam beraman.";
 return "Tushundim 👌 Men sizning istagingizni taste signalga aylantira olaman. Nima qidiryapsiz — anime, film, musiqa, restoran, sayohat joyi yoki boshqa tajribami? Istagingizni oddiy gap bilan yozavering.";
}

app.post("/api/chat",async(req,res)=>{
 const message=String(req.body?.message||"").trim();
 if(!message)return res.status(400).json({error:"Message is required."});
 res.json({reply:chatReply(message),demo:true});
});

app.post("/api/discover",async(req,res)=>{
 const query=String(req.body?.query||"").trim();
 if(!query)return res.status(400).json({error:"Query is required."});
 if(!process.env.QLOO_API_KEY)return res.json({demo:true,query,message:"TastePilot is ready. Add QLOO_API_KEY to enable live Qloo results.",results:[]});
 try{
  const url=new URL("https://hackathon.api.qloo.com/search");
  url.searchParams.set("query",query);
  url.searchParams.set("type","urn:entity:movie");
  const response=await fetch(url,{headers:{"X-Api-Key":process.env.QLOO_API_KEY}});
  const text=await response.text();
  if(!response.ok)return res.status(response.status).json({error:"Qloo request failed.",details:text});
  let data; try{data=JSON.parse(text)}catch{data={raw:text}}
  res.json({demo:false,query,results:data});
 }catch(error){res.status(500).json({error:"Server error.",details:error.message})}
});
if(!process.env.VERCEL){const port=process.env.PORT||3000;app.listen(port,()=>console.log(`TastePilot running on http://localhost:${port}`))}
export default app;
