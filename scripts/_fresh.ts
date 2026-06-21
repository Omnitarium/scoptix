import { prisma } from "@/lib/prisma";
import { runCveFetch, resolveStartDate } from "@/lib/cve-fetch";
import { matchTechToCves } from "@/lib/cve-match";
(async()=>{
  const start=resolveStartDate("30d");
  console.log("fetch 30d pub window from", start.toISOString().slice(0,10));
  const res=await runCveFetch(prisma,{apiKey:null,startDate:start,proxyUrl:null});
  const total=await prisma.cve.count();
  const oldest=await prisma.cve.findFirst({orderBy:{published:"asc"},select:{id:true,published:true}});
  console.log("stored:",res.stored,"| total:",total,"| oldest:",oldest?.id,oldest?.published.toISOString().slice(0,10));

  // re-match all techs strictly
  const techs=await prisma.subdomainTechnology.findMany({select:{id:true,name:true,version:true,cpe:true}});
  let withVer=0, hits=0;
  for(const t of techs){
    if(t.version) withVer++;
    const h=await matchTechToCves(prisma,t);
    for(const x of h){
      await prisma.subdomainTechnologyCve.upsert({where:{subdomainTechnologyId_cveId:{subdomainTechnologyId:t.id,cveId:x.cveId}},create:{subdomainTechnologyId:t.id,cveId:x.cveId,matchedVersion:x.matchedVersion},update:{matchedVersion:x.matchedVersion}});
      hits++;
    }
  }
  console.log("techs:",techs.length,"| withVersion:",withVer,"| STRICT matches:",hits);
  const sample=await prisma.subdomainTechnologyCve.findMany({take:10,select:{cveId:true,matchedVersion:true,subdomainTechnology:{select:{name:true,version:true}}}});
  sample.forEach(s=>console.log(" ",s.cveId,"| tech:",s.subdomainTechnology.name,s.subdomainTechnology.version,"| matchedVer:",s.matchedVersion));
})().finally(()=>process.exit(0));
