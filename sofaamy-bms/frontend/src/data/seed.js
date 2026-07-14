// ============================================================
// DEMO SEED DATA — realistic Ghana / GHS content so every screen
// looks live. Replaced by the SQLite backend once wired.
// ============================================================

export const COMPANY = {
  name: 'Sofaamy Co. Ltd',
  tagline: 'Glass & Aluminium Fabrication',
  location: 'Accra, Ghana',
  poweredBy: 'Veloxa Technology',
}

export const CURRENT_USER = { name:'Kwame Mensah', role:'Supervisor', initials:'KM' }

const av = ['#2471A3','#1E8449','#CA6F1E','#6C3483','#C0392B','#16A085','#8E44AD','#2E86C1']
export const avatarColor = (i) => av[i % av.length]

export const STAGES = [
  { key:'cutting',    label:'Cutting' },
  { key:'processing', label:'Processing' },
  { key:'holes',      label:'Holes / Routing' },
  { key:'assembly',   label:'Assembly' },
  { key:'glazing',    label:'Glazing' },
  { key:'qa',         label:'Quality Check' },
  { key:'dispatch',   label:'Dispatch' },
  { key:'install',    label:'Installation' },
]

export const KPIS = [
  { key:'revenue', label:'Revenue (This Month)', value:'₵486,200', trend:'+18.4%', dir:'up',   tone:'green'  },
  { key:'jobs',    label:'Active Jobs',          value:'34',       trend:'+6',     dir:'up',   tone:'blue'   },
  { key:'quotes',  label:'Open Quotations',      value:'19',       trend:'8 pending', dir:'flat', tone:'orange' },
  { key:'convert', label:'Quote → Order Rate',   value:'62%',      trend:'+4.1%',  dir:'up',   tone:'purple' },
]

// Revenue trend (last 8 weeks, GHS thousands)
export const REVENUE_TREND = [
  { label:'W1', value:62 }, { label:'W2', value:74 }, { label:'W3', value:58 },
  { label:'W4', value:91 }, { label:'W5', value:88 }, { label:'W6', value:104 },
  { label:'W7', value:97 }, { label:'W8', value:121 },
]

export const PIPELINE_MIX = [
  { label:'Cutting',    value:6,  color:'#2471A3' },
  { label:'Assembly',   value:9,  color:'#1E8449' },
  { label:'Glazing',    value:5,  color:'#CA6F1E' },
  { label:'Quality',    value:4,  color:'#6C3483' },
  { label:'Dispatch',   value:7,  color:'#16A085' },
  { label:'Install',    value:3,  color:'#C0392B' },
]

export const PRODUCT_DEMAND = [
  { label:'Sliding Windows', value:38 },
  { label:'Curtain Walls',   value:22 },
  { label:'Doors',           value:18 },
  { label:'Partitions',      value:12 },
  { label:'Balustrades',     value:10 },
]

export const CLIENTS = [
  { id:1, name:'Adom Estates Ltd',        contact:'Ama Owusu',    phone:'+233 24 118 2204', location:'East Legon, Accra',    jobs:5, value:'₵214,500', type:'company' },
  { id:2, name:'Nii Armah Residence',     contact:'Nii Armah',    phone:'+233 20 555 9081', location:'Cantonments, Accra',   jobs:2, value:'₵58,900',  type:'individual' },
  { id:3, name:'Golden Tulip Hotel',      contact:'Facilities',   phone:'+233 30 221 3344', location:'Airport City, Accra',  jobs:3, value:'₵402,000', type:'company' },
  { id:4, name:'Mensah Family Home',      contact:'Efua Mensah',  phone:'+233 27 664 1120', location:'Spintex, Accra',       jobs:1, value:'₵31,200',  type:'individual' },
  { id:5, name:'Trasacco Valley',         contact:'Project Team', phone:'+233 24 900 7788', location:'Trasacco, Accra',      jobs:4, value:'₵318,700', type:'company' },
  { id:6, name:'Kumasi City Mall',        contact:'Ops Manager',  phone:'+233 32 208 4455', location:'Kumasi',               jobs:2, value:'₵176,300', type:'company' },
]

export const LEADS = [
  { id:1, name:'Villa Project — Aburi',   contact:'Kofi Asante',  value:'₵120,000', stage:'Qualified',  source:'WhatsApp', owner:'Yaa Boateng',  age:'2d' },
  { id:2, name:'Office Fit-out — Ridge',  contact:'Sarah Tetteh', value:'₵260,000', stage:'Proposal',   source:'Referral', owner:'Kwame Mensah', age:'5d' },
  { id:3, name:'Apartment Block — Tema',  contact:'Ibrahim M.',   value:'₵540,000', stage:'Survey',     source:'Field Rep',owner:'Yaa Boateng',  age:'1d' },
  { id:4, name:'Retail Shopfront — Osu',  contact:'Grace A.',     value:'₵88,000',  stage:'New',        source:'Walk-in',  owner:'Kwame Mensah', age:'4h' },
  { id:5, name:'Hotel Balustrades',       contact:'Golden Tulip', value:'₵150,000', stage:'Negotiation',source:'WhatsApp', owner:'Kwame Mensah', age:'8d' },
]

export const QUOTES = [
  { id:'SOF-Q-2026-0142', client:'Adom Estates Ltd',  product:'Sliding Windows ×12', total:'₵86,400',  status:'Approved', date:'05 Jul 2026' },
  { id:'SOF-Q-2026-0141', client:'Golden Tulip Hotel',product:'Curtain Wall',        total:'₵214,000', status:'Sent',     date:'04 Jul 2026' },
  { id:'SOF-Q-2026-0140', client:'Nii Armah Residence',product:'Aluminium Door ×2',  total:'₵24,600',  status:'Draft',    date:'04 Jul 2026' },
  { id:'SOF-Q-2026-0139', client:'Trasacco Valley',   product:'Partition + Glass',   total:'₵112,800', status:'Approved', date:'02 Jul 2026' },
  { id:'SOF-Q-2026-0138', client:'Mensah Family Home',product:'Casement Windows ×6', total:'₵31,200',  status:'Rejected', date:'01 Jul 2026' },
  { id:'SOF-Q-2026-0137', client:'Kumasi City Mall',  product:'Frameless Shopfront', total:'₵96,500',  status:'Sent',     date:'30 Jun 2026' },
]

export const JOBS = [
  { id:'SOF-2026-081', client:'Adom Estates Ltd',   product:'Sliding Windows ×12', stage:'assembly', progress:55, due:'12 Jul', supervisor:'Kwame Mensah', paid:'50%' },
  { id:'SOF-2026-080', client:'Golden Tulip Hotel', product:'Curtain Wall',        stage:'cutting',  progress:15, due:'28 Jul', supervisor:'Yaa Boateng',  paid:'50%' },
  { id:'SOF-2026-079', client:'Trasacco Valley',    product:'Partition + Glass',   stage:'glazing',  progress:72, due:'10 Jul', supervisor:'Kwame Mensah', paid:'50%' },
  { id:'SOF-2026-078', client:'Nii Armah Residence',product:'Aluminium Door ×2',   stage:'qa',       progress:88, due:'08 Jul', supervisor:'Yaa Boateng',  paid:'100%' },
  { id:'SOF-2026-077', client:'Kumasi City Mall',   product:'Frameless Shopfront', stage:'dispatch', progress:94, due:'07 Jul', supervisor:'Kwame Mensah', paid:'100%' },
  { id:'SOF-2026-076', client:'Mensah Family Home', product:'Casement Windows ×6', stage:'install',  progress:98, due:'06 Jul', supervisor:'Yaa Boateng',  paid:'100%' },
]

export const SURVEYS = [
  { id:'SV-311', job:'SOF-2026-082', site:'Apartment Block — Tema', rep:'Kofi Adjei',  status:'Completed', when:'Today 09:20', units:14, variance:'+2.1%' },
  { id:'SV-310', job:'SOF-2026-080', site:'Airport City, Accra',   rep:'Kofi Adjei',  status:'Completed', when:'Yesterday',  units:8,  variance:'-0.4%' },
  { id:'SV-309', job:'—',           site:'Villa Project — Aburi',  rep:'Abena Sarpong',status:'Scheduled', when:'08 Jul 11:00',units:0,  variance:'—' },
  { id:'SV-308', job:'SOF-2026-079', site:'Trasacco, Accra',       rep:'Abena Sarpong',status:'Review',    when:'03 Jul',     units:6,  variance:'+5.0%' },
]

export const INVENTORY = [
  { code:'AL-PRO-40',  name:'Aluminium Profile 40mm', cat:'Profile',  stock:420, unit:'m',   reorder:200, price:'₵85/m',    status:'ok' },
  { code:'AL-PRO-60',  name:'Aluminium Profile 60mm', cat:'Profile',  stock:180, unit:'m',   reorder:200, price:'₵110/m',   status:'low' },
  { code:'GL-CLR-6',   name:'Clear Glass 6mm',        cat:'Glass',    stock:64,  unit:'m²',  reorder:40,  price:'₵120/m²',  status:'ok' },
  { code:'GL-TMP-8',   name:'Tempered Glass 8mm',     cat:'Glass',    stock:22,  unit:'m²',  reorder:30,  price:'₵230/m²',  status:'low' },
  { code:'HW-SLD-01',  name:'Sliding Roller Set',     cat:'Hardware', stock:96,  unit:'set', reorder:50,  price:'₵240/set', status:'ok' },
  { code:'HW-HNG-01',  name:'Casement Hinge',         cat:'Hardware', stock:12,  unit:'pcs', reorder:40,  price:'₵45/pc',   status:'critical' },
  { code:'AC-GSK-01',  name:'EPDM Rubber Gasket',     cat:'Accessory',stock:800, unit:'m',   reorder:300, price:'₵6/m',     status:'ok' },
]

export const DISPATCH = [
  { id:'DSP-091', job:'SOF-2026-077', client:'Kumasi City Mall',  units:6, driver:'Sammy K.',  vehicle:'GT-4821-22', status:'In Transit', qr:'scanned' },
  { id:'DSP-090', job:'SOF-2026-078', client:'Nii Armah Residence',units:2,driver:'Emmanuel O.',vehicle:'GS-1190-21', status:'Delivered',  qr:'scanned' },
  { id:'DSP-089', job:'SOF-2026-076', client:'Mensah Family Home',units:6, driver:'Sammy K.',  vehicle:'GT-4821-22', status:'Installed',  qr:'scanned' },
  { id:'DSP-088', job:'SOF-2026-079', client:'Trasacco Valley',   units:4, driver:'—',          vehicle:'—',          status:'Scheduled',  qr:'pending' },
]

export const QA_CHECKS = [
  { id:'QC-204', job:'SOF-2026-078', product:'Aluminium Door ×2',  stage:'Post-Production',  inspector:'Yaw Darko', result:'Pass',   score:'96%', when:'Today' },
  { id:'QC-203', job:'SOF-2026-077', product:'Frameless Shopfront',stage:'Post-Production',  inspector:'Yaw Darko', result:'Pass',   score:'92%', when:'Yesterday' },
  { id:'QC-202', job:'SOF-2026-079', product:'Partition + Glass',  stage:'Glazing Check',    inspector:'Yaw Darko', result:'Rework', score:'71%', when:'2 Jul' },
  { id:'QC-201', job:'SOF-2026-076', product:'Casement Windows ×6',stage:'Post-Installation',inspector:'Yaw Darko', result:'Pass',   score:'98%', when:'1 Jul' },
]

export const TEAM = [
  { name:'Kwame Mensah', role:'Supervisor',  jobs:12, phone:'+233 24 000 1122' },
  { name:'Yaa Boateng',  role:'Supervisor',  jobs:9,  phone:'+233 20 111 2233' },
  { name:'Kofi Adjei',   role:'Field Rep',   jobs:'—',phone:'+233 27 222 3344' },
  { name:'Abena Sarpong',role:'Field Rep',   jobs:'—',phone:'+233 24 333 4455' },
  { name:'Yaw Darko',    role:'Quality (QA)',jobs:'—',phone:'+233 55 444 5566' },
  { name:'Esi Quaye',    role:'Accounts',    jobs:'—',phone:'+233 26 555 6677' },
  { name:'Kojo Antwi',   role:'Procurement', jobs:'—',phone:'+233 24 666 7788' },
]

export const ACTIVITY = [
  { who:'Yaa Boateng',  what:'moved job SOF-2026-080 to Cutting',        when:'12m ago',  tone:'blue' },
  { who:'System',       what:'sent quote SOF-Q-2026-0142 via WhatsApp',  when:'40m ago',  tone:'green' },
  { who:'Kofi Adjei',   what:'submitted survey SV-311 (14 units)',       when:'1h ago',   tone:'purple' },
  { who:'Esi Quaye',    what:'confirmed 50% deposit — Adom Estates',     when:'2h ago',   tone:'gold' },
  { who:'Yaw Darko',    what:'flagged SOF-2026-079 for rework at Glazing',when:'3h ago',  tone:'red' },
  { who:'Kwame Mensah', what:'approved quote for Trasacco Valley',       when:'5h ago',   tone:'blue' },
]

export const statusTone = (s) => ({
  Approved:'b-green', Sent:'b-blue', Draft:'b-gray', Rejected:'b-red',
  Pass:'b-green', Rework:'b-orange', Fail:'b-red',
  Completed:'b-green', Scheduled:'b-blue', Review:'b-orange',
  Delivered:'b-green', Installed:'b-green', 'In Transit':'b-blue',
  ok:'b-green', low:'b-orange', critical:'b-red',
  New:'b-gray', Qualified:'b-blue', Survey:'b-purple', Proposal:'b-orange', Negotiation:'b-gold',
}[s] || 'b-gray')
