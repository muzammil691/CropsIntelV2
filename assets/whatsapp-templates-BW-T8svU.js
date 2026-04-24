const t={OTP_VERIFICATION:"otp_verification",WELCOME_V2:"welcome_v2",INVITE_BUYER:"invite_buyer",INVITE_SUPPLIER:"invite_supplier",INVITE_BROKER:"invite_broker",INVITE_TEAM:"invite_team",TRADE_ALERT:"trade_alert",MARKET_BRIEF:"market_brief",OFFER_NEW:"offer_new",NEWS_UPDATE:"news_update",ACCOUNT_ACTION:"account_action",ZYRA_DIGEST:"zyra_digest"},o={[t.OTP_VERIFICATION]:{category:"authentication",language:"en",variables:["code"],body_preview:"Your CropsIntel verification code is {{1}}. This code expires in 10 minutes. Do not share this code with anyone.",fallback:({code:e})=>`CropsIntel verification code: ${e}

This code expires in 10 minutes. Do not share this code with anyone.

— CropsIntel by MAXONS`,description:"OTP delivered on every login. Meta approves auth templates fast-track (minutes to hours)."},[t.WELCOME_V2]:{category:"utility",language:"en",variables:["first_name"],body_preview:"Hi {{1}}, welcome to CropsIntel V2 by MAXONS. Your almond market intelligence dashboard is ready — ABC position data, live pricing, and Zyra AI are live at cropsintel.com. Reply HELP anytime.",fallback:({first_name:e})=>`Hi ${e||"there"}, welcome to CropsIntel V2 by MAXONS.

Your almond market intelligence dashboard is ready — ABC position data, live pricing, and Zyra AI are live at https://cropsintel.com

Reply HELP anytime.`,button:{text:"Open dashboard",url:"https://cropsintel.com"},description:"Sent right after first WhatsApp OTP login succeeds."},[t.INVITE_BUYER]:{category:"utility",language:"en",variables:["name","inviter"],body_preview:"Hi {{1}}, {{2}} has invited you to CropsIntel — MAXONS almond market intelligence. Get live ABC data, pricing, and Zyra AI. Register at cropsintel.com/register or reply YES and we will set you up.",fallback:({name:e,inviter:n})=>`Hi ${e||"there"}, ${n||"MAXONS Team"} has invited you to CropsIntel — MAXONS almond market intelligence.

Get live ABC data, pricing, and Zyra AI. Register at https://cropsintel.com/register or reply YES and we will set you up.`,button:{text:"Register now",url:"https://cropsintel.com/register"},description:"For contact_type buyer / customer / importer."},[t.INVITE_SUPPLIER]:{category:"utility",language:"en",variables:["name","inviter"],body_preview:"Hi {{1}}, {{2}} has invited you to CropsIntel as a supply partner. Track your shipments, get export-market demand signals, and connect with global buyers. Register at cropsintel.com/register.",fallback:({name:e,inviter:n})=>`Hi ${e||"there"}, ${n||"MAXONS Team"} has invited you to CropsIntel as a supply partner.

Track your shipments, get export-market demand signals, and connect with global buyers. Register at https://cropsintel.com/register`,button:{text:"Register now",url:"https://cropsintel.com/register"},description:"For contact_type supplier / handler / grower / packer / processor."},[t.INVITE_BROKER]:{category:"utility",language:"en",variables:["name","inviter"],body_preview:"Hi {{1}}, {{2}} has invited you to CropsIntel as a trading partner. Access live MAXONS offers, destination flow, and position data. Register at cropsintel.com/register.",fallback:({name:e,inviter:n})=>`Hi ${e||"there"}, ${n||"MAXONS Team"} has invited you to CropsIntel as a trading partner.

Access live MAXONS offers, destination flow, and position data. Register at https://cropsintel.com/register`,button:{text:"Register now",url:"https://cropsintel.com/register"},description:"For contact_type broker / trader."},[t.INVITE_TEAM]:{category:"utility",language:"en",variables:["name","inviter"],body_preview:"Hi {{1}}, {{2}} has added you to the MAXONS team on CropsIntel. You now have internal team access to margin, cost basis, and CRM. Log in at cropsintel.com.",fallback:({name:e,inviter:n})=>`Hi ${e||"there"}, ${n||"The admin"} has added you to the MAXONS team on CropsIntel.

You now have internal team access to margin, cost basis, and CRM. Log in at https://cropsintel.com`,button:{text:"Open CropsIntel",url:"https://cropsintel.com"},description:"For internal team roles — maxons_team / analyst / trader / sales / admin."},[t.TRADE_ALERT]:{category:"marketing",language:"en",variables:["title","summary","urgency"],body_preview:"CropsIntel alert ({{3}}): {{1}}. {{2}}. Full analysis at cropsintel.com/intelligence.",fallback:({title:e,summary:n,urgency:i})=>`${i==="high"?"🔴":i==="medium"?"🟡":"🟢"} CropsIntel alert (${i||"medium"}): ${e}

${n}

Full analysis: https://cropsintel.com/intelligence`,button:{text:"View analysis",url:"https://cropsintel.com/intelligence"},description:"Zyra-generated trade signals. Marketing category — recipient opted-in only."},[t.MARKET_BRIEF]:{category:"marketing",language:"en",variables:["date","summary"],body_preview:"MAXONS Market Brief {{1}}: {{2}}. Read the full brief at cropsintel.com/news.",fallback:({date:e,summary:n})=>`MAXONS Market Brief ${e}:

${n}

Read the full brief at https://cropsintel.com/news`,button:{text:"Read brief",url:"https://cropsintel.com/news"},description:"Scheduled digest. Opt-out via STOP."},[t.OFFER_NEW]:{category:"marketing",language:"en",variables:["product","price","quantity","validity"],body_preview:"New MAXONS offer: {{1}} at {{2}}. Quantity {{3}}, valid until {{4}}. Reply ACCEPT to confirm interest or view at cropsintel.com/trading.",fallback:({product:e,price:n,quantity:i,validity:r})=>`New MAXONS offer:

${e} at ${n}
Quantity: ${i}
Valid until: ${r}

Reply ACCEPT to confirm interest or view at https://cropsintel.com/trading`,button:{text:"View offer",url:"https://cropsintel.com/trading"},description:"Sent only to CRM contacts with has_offers_subscription tag."},[t.NEWS_UPDATE]:{category:"marketing",language:"en",variables:["headline","summary"],body_preview:"CropsIntel news: {{1}}. {{2}}. Read more at cropsintel.com/news.",fallback:({headline:e,summary:n})=>`CropsIntel news: ${e}

${n}

Read more at https://cropsintel.com/news`,button:{text:"Read news",url:"https://cropsintel.com/news"},description:"Scraper-driven. Throttled to once per day max per recipient."},[t.ACCOUNT_ACTION]:{category:"utility",language:"en",variables:["name","action"],body_preview:"Hi {{1}}, please {{2}} at cropsintel.com/settings. Reply HELP if you need assistance.",fallback:({name:e,action:n})=>`Hi ${e||"there"}, please ${n||"complete your profile"} at https://cropsintel.com/settings

Reply HELP if you need assistance.`,button:{text:"Open settings",url:"https://cropsintel.com/settings"},description:"Generic nudge — profile-completion, verification, acceptance-needed flows."},[t.ZYRA_DIGEST]:{category:"utility",language:"en",variables:["name","summary"],body_preview:"Hi {{1}}, Zyra daily digest: {{2}}. Open cropsintel.com/intelligence for the full brief.",fallback:({name:e,summary:n})=>`Hi ${e||"there"}, Zyra daily digest:

${n}

Open https://cropsintel.com/intelligence for the full brief.`,button:{text:"Open Zyra",url:"https://cropsintel.com/intelligence"},description:"Internal-team utility brief. Daily opt-in."}},c={buyer:t.INVITE_BUYER,customer:t.INVITE_BUYER,importer:t.INVITE_BUYER,supplier:t.INVITE_SUPPLIER,handler:t.INVITE_SUPPLIER,grower:t.INVITE_SUPPLIER,packer:t.INVITE_SUPPLIER,processor:t.INVITE_SUPPLIER,broker:t.INVITE_BROKER,trader:t.INVITE_BROKER,maxons_team:t.INVITE_TEAM,analyst:t.INVITE_TEAM,sales:t.INVITE_TEAM,admin:t.INVITE_TEAM,logistics:t.INVITE_BUYER,industry:t.INVITE_BUYER,finance:t.INVITE_TEAM};function p(e){if(!e)return t.INVITE_BUYER;const n=String(e).toLowerCase().trim();return c[n]||t.INVITE_BUYER}function d(e,n={}){const i=o[e];if(!i)throw new Error(`Unknown template key: ${e}`);const r={};return i.variables.forEach((s,l)=>{const a=n[s];r[String(l+1)]=a==null||a===""?" ":String(a)}),r}function u(e,n={}){const i=o[e];if(!i)throw new Error(`Unknown template key: ${e}`);return typeof i.fallback!="function"?i.body_preview||"":i.fallback(n)}export{o as TEMPLATE_CATALOG,t as TEMPLATE_KEYS,d as buildTemplateVariables,p as pickInviteTemplate,u as renderFallback};
//# sourceMappingURL=whatsapp-templates-BW-T8svU.js.map
