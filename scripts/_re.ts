import axios from "axios";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function t(label:string,params:Record<string,string|number>){
  for(let i=0;i<5;i++){
    const r=await axios.get("https://services.nvd.nist.gov/rest/json/cves/2.0",{params,headers:{"User-Agent":UA,Accept:"application/json"},timeout:60000,validateStatus:()=>true});
    if(r.status===200){console.log(label,"total:",r.data?.totalResults);return;}
    process.stdout.write(`[${r.status}]`);await sleep(7000);
  }
  console.log(label,"FAIL");
}
(async()=>{
  await t("7d Z      ",{resultsPerPage:1,lastModStartDate:"2026-06-14T13:31:32.338Z",lastModEndDate:"2026-06-21T13:31:32.338Z"});await sleep(7000);
  await t("7d noTZ   ",{resultsPerPage:1,lastModStartDate:"2026-06-14T13:31:32.338",lastModEndDate:"2026-06-21T13:31:32.338"});await sleep(7000);
  await t("7d +00:00 ",{resultsPerPage:1,lastModStartDate:"2026-06-14T13:31:32.338+00:00",lastModEndDate:"2026-06-21T13:31:32.338+00:00"});
})().finally(()=>process.exit(0));
