import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app=express();
app.use(express.json({limit:"1mb"}));
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const publicDir=path.join(__dirname,"public");
app.use(express.static(publicDir));
app.get("/",(req,res)=>res.sendFile(path.join(publicDir,"index.html")));

function chatReply(message){
 const q=message.toLowerCase();
 const has=(...words)=>words.some(w=>q.includes(w));
 if(has("salom","hello","hi","hey")) return "Salom! 👋 Men TastePilot. Anime, film, musiqa, restoran, joy yoki boshqa tajriba haqida istagingizni yozing.";
 if(has("anime","animeni","animega")) return "Albatta 🎬 Sizga anime topib beraman. Masalan, janrni ayting: romantika, komediya, action, school life yoki happy ending.";
 if(has("film","movie","kino","serial")) return "Zo‘r 🎬 Qanday film yoki serial qidiryapsiz? Janr, kayfiyat yoki yoqtirgan filmingizni yozing.";
 if(has("musiqa","music","playlist","qo‘shiq","song")) return "🎧 Kayfiyatingizni ayting — masalan “sokin tungi musiqa” yoki “energetik gym playlist”.";
 if(has("restoran","restaurant","ovqat","dinner","kafe","cafe","taom")) return "🍽️ Qaysi shahar yoki hudud? Masalan: “Toshkentda sokin romantik dinner uchun joy”.";
 if(has("nima ko‘ray","nima ko'ray","tavsiya","recommend","topib ber","qidir")) return "😊 Albatta. Menga istagingizni oddiy gap bilan yozavering — men uni taste signalga aylantirishga yordam beraman.";
 return "Tushundim 👌 Men sizning istagingizni taste signalga aylantira olaman. Nima qidiryapsiz — anime, film, musiqa, restoran, sayohat joyi yoki boshqa tajribami?";
}

function cleanHistory(history){
 if(!Array.isArray(history)) return [];
 return history.slice(-12).filter(m=>m && (m.role==="user"||m.role==="model") && typeof m.text==="string")
   .map(m=>({role:m.role,parts:[{text:m.text.slice(0,3000)}]}));
}

async function geminiReply(message,history){
 const key=process.env.GEMINI_API_KEY;
 if(!key) return null;
 const model=process.env.GEMINI_MODEL||"gemini-3.6-flash";
 const prior=cleanHistory(history);\n const last=prior[prior.length-1];\n const contents=(last?.role==="user" && last?.parts?.[0]?.text===message) ? prior : [...prior,{role:"user",parts:[{text:message}]}];
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({
   systemInstruction:{parts:[{text:
    "You are TastePilot AI, a friendly multilingual cultural-discovery agent. Understand Uzbek, English and Russian and reply in the same language as the user. Have natural conversation, ask useful follow-up questions when needed, remember the recent chat context, and help users discover anime, movies, music, restaurants, travel and experiences. Turn vague preferences into clear taste signals. Be honest: do not claim Qloo data was used unless the server actually provides Qloo results. Do not invent watch links, prices, availability, or facts. Keep replies useful but complete. When the user asks for a numbered list or a specific number of recommendations, provide the full requested number before stopping. Do not cut a recommendation in the middle. For anime recommendations, briefly explain why each pick matches the user, and finish with a useful follow-up question. TastePilot will later use Qloo for cultural recommendations."
   }]},
   contents,
   generationConfig:{maxOutputTokens:3000}
  })
 });
 const raw=await response.text();
 if(!response.ok) throw new Error(`Gemini request failed: ${response.status} ${raw.slice(0,500)}`);
 const data=JSON.parse(raw);
 const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
 if(!reply) throw new Error("Gemini returned no text.");
 return reply;
}

app.post("/api/chat",async(req,res)=>{
 const message=String(req.body?.message||"").trim();
 if(!message)return res.status(400).json({error:"Message is required."});
 const history=Array.isArray(req.body?.history)?req.body.history:[];
 try{
  const ai=await geminiReply(message,history);
  if(ai) return res.json({reply:ai,brain:"gemini",demo:false});
  return res.json({reply:chatReply(message),brain:"fallback",demo:true});
 }catch(error){
  console.error(error);
  return res.status(502).json({error:"AI brain is temporarily unavailable.",details:error.message});
 }
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
