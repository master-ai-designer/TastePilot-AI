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
 return history.slice(-6).filter(m=>m && (m.role==="user"||m.role==="model") && typeof m.text==="string")
   .map(m=>({role:m.role,parts:[{text:m.text.slice(0,1800)}]}));
}

const requestLog=new Map();
function allowChatRequest(req){
 const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
 const now=Date.now();
 const recent=(requestLog.get(ip)||[]).filter(t=>now-t<60000);
 if(recent.length>=8)return false;
 recent.push(now); requestLog.set(ip,recent);
 return true;
}

async function geminiReply(message,history){
 const key=process.env.GEMINI_API_KEY;
 if(!key) return null;
 const primary=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
 const fallback=process.env.GEMINI_FALLBACK_MODEL||"gemini-2.5-flash-lite";
 const systemText="You are TastePilot AI, a polished multilingual cultural-discovery agent. Understand Uzbek, English and Russian and reply in the same language as the user. Be warm, concise, natural and useful. Help with movies, music, restaurants, travel and experiences. Turn vague preferences into clear taste signals. Remember recent context. Never claim Qloo data was used unless the server actually provides Qloo results. Never invent links, prices, availability or facts. If the user asks for N recommendations, provide all N. Prefer practical recommendations and brief explanations.";
 const prior=cleanHistory(history);
 const last=prior[prior.length-1];
 const contents=(last?.role==="user" && last?.parts?.[0]?.text===message) ? prior : [...prior,{role:"user",parts:[{text:message}]}];
 const payload={systemInstruction:{parts:[{text:systemText}]},contents,generationConfig:{maxOutputTokens:1200}};
 async function call(model,body){
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const raw=await response.text();
  if(!response.ok){
   const error=new Error(`Gemini request failed: ${response.status}`);
   error.status=response.status;
   error.raw=raw.slice(0,500);
   throw error;
  }
  const data=JSON.parse(raw);
  const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
  if(!reply)throw new Error("Gemini returned no text.");
  return reply;
 }
 try{return await call(primary,payload)}
 catch(firstError){
  console.error("Primary Gemini failed:",firstError.status,firstError.raw||firstError.message);
  if(firstError.status!==429 || fallback===primary)throw firstError;
  try{return await call(fallback,{...payload,contents:[{role:"user",parts:[{text:message}]}]})}
  catch(secondError){
   console.error("Fallback Gemini failed:",secondError.status,secondError.raw||secondError.message);
   throw secondError;
  }
 }
}

app.post("/api/chat",async(req,res)=>{
 const message=String(req.body?.message||"").trim();
 if(!message)return res.status(400).json({error:"Message is required."});
 if(!allowChatRequest(req))return res.status(429).json({error:"Too many requests. Please wait a moment and try again."});
 const history=Array.isArray(req.body?.history)?req.body.history:[];
 try{
  const ai=await geminiReply(message,history);
  if(ai)return res.json({reply:ai,brain:"gemini",demo:false});
  return res.json({reply:chatReply(message),brain:"fallback",demo:true});
 }catch(error){
  console.error(error);
  const status=error.status===429?429:502;
  const messageOut=status===429?"AI usage limit reached for the moment. Please try again shortly.":"AI brain is temporarily unavailable. Please try again.";
  return res.status(status).json({error:messageOut});
 }
});

app.post("/api/voice-token",async(req,res)=>{
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:"Voice AI is not configured yet."});
 try{
  const now=Date.now();
  const body={
   uses:1,
   expireTime:new Date(now+30*60*1000).toISOString(),
   newSessionExpireTime:new Date(now+60*1000).toISOString(),
   liveConnectConstraints:{
    model:"models/gemini-3.8-live",
    config:{
     sessionResumption:{},
     responseModalities:["AUDIO"],
     systemInstruction:{parts:[{text:"You are TastePilot AI, a friendly multilingual cultural-discovery voice agent. Speak naturally, briefly and helpfully. Understand Uzbek, English and Russian and reply in the user's language. Help with movies, music, restaurants, travel and experiences. Do not invent facts or claim Qloo data unless it was actually provided."}]}
    }
   }
  };
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens",{
   method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const raw=await response.text();
  if(!response.ok)return res.status(response.status).json({error:"Could not start voice agent."});
  const data=JSON.parse(raw);
  return res.json({token:data.name,model:"gemini-3.8-live"});
 }catch(error){
  console.error("Voice token error:",error);
  return res.status(502).json({error:"Voice agent is temporarily unavailable."});
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
