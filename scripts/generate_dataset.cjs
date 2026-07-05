const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../public');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const csvPath = path.join(targetDir, 'pharmaflow_medicines_master.csv');

// Components for generating 5000+ medicines
const categories = ['Tablets', 'Capsules', 'Syrups', 'Inhalers', 'Injections', 'Ointments', 'Drops', 'Others'];

const manufacturers = [
  'GSK Pharma', 'Abbott India', 'Sun Pharmaceutical Industries', 'Cipla Ltd', 
  'Lupin Ltd', 'Mankind Pharma', 'Torrent Pharmaceuticals', 'Dr. Reddy s Laboratories', 
  'Alkem Laboratories', 'Glenmark Pharmaceuticals', 'Cadila Pharmaceuticals', 
  'Zydus Lifesciences', 'Sanofi India', 'USV Private Ltd', 'Pfizer India', 
  'Micro Labs Ltd', 'Blue Cross Laboratories', 'Aristo Pharmaceuticals', 
  'FDC Ltd', 'J.B. Chemicals & Pharmaceuticals', 'Wockhardt Ltd', 
  'Apex Laboratories', 'Intas Pharmaceuticals', 'Macleods Pharmaceuticals', 
  'Hetero Healthcare', 'Biocon Ltd', 'AstraZeneca India', 'Bayer India',
  'IPCA Laboratories', 'Alembic Pharmaceuticals'
];

const medicineTemplates = [
  { prefix: 'Calpol', generic: 'Paracetamol', category: 'Tablets', brand: 'Calpol', unit: 'Strip', basePrice: 15, range: 20 },
  { prefix: 'Crocin Advance', generic: 'Paracetamol', category: 'Tablets', brand: 'Crocin', unit: 'Strip', basePrice: 12, range: 15 },
  { prefix: 'Dolo', generic: 'Paracetamol', category: 'Tablets', brand: 'Dolo', unit: 'Strip', basePrice: 20, range: 15 },
  { prefix: 'Pacimol', generic: 'Paracetamol', category: 'Tablets', brand: 'Pacimol', unit: 'Strip', basePrice: 10, range: 10 },
  { prefix: 'Sumo L', generic: 'Paracetamol', category: 'Tablets', brand: 'Sumo', unit: 'Strip', basePrice: 15, range: 12 },
  
  { prefix: 'Combiflam', generic: 'Ibuprofen + Paracetamol', category: 'Tablets', brand: 'Combiflam', unit: 'Strip', basePrice: 25, range: 25 },
  { prefix: 'Flexon', generic: 'Ibuprofen + Paracetamol', category: 'Tablets', brand: 'Flexon', unit: 'Strip', basePrice: 20, range: 15 },
  { prefix: 'Ibugesic Plus', generic: 'Ibuprofen + Paracetamol', category: 'Tablets', brand: 'Ibugesic', unit: 'Strip', basePrice: 18, range: 15 },
  
  { prefix: 'Acecloc', generic: 'Aceclofenac + Paracetamol', category: 'Tablets', brand: 'Acecloc', unit: 'Strip', basePrice: 45, range: 40 },
  { prefix: 'Zerodol-P', generic: 'Aceclofenac + Paracetamol', category: 'Tablets', brand: 'Zerodol', unit: 'Strip', basePrice: 60, range: 40 },
  { prefix: 'Hifenac-P', generic: 'Aceclofenac + Paracetamol', category: 'Tablets', brand: 'Hifenac', unit: 'Strip', basePrice: 55, range: 35 },
  { prefix: 'Zerodol-SP', generic: 'Aceclofenac + Paracetamol + Serratiopeptidase', category: 'Tablets', brand: 'Zerodol', unit: 'Strip', basePrice: 90, range: 50 },
  
  { prefix: 'Meftal-Spas', generic: 'Mefenamic Acid + Dicyclomine', category: 'Tablets', brand: 'Meftal', unit: 'Strip', basePrice: 35, range: 20 },
  { prefix: 'Cyclopam', generic: 'Dicyclomine + Paracetamol', category: 'Tablets', brand: 'Cyclopam', unit: 'Strip', basePrice: 38, range: 25 },
  
  { prefix: 'Ultracet', generic: 'Tramadol + Paracetamol', category: 'Tablets', brand: 'Ultracet', unit: 'Strip', basePrice: 160, range: 90 },
  { prefix: 'Tramazac', generic: 'Tramadol', category: 'Capsules', brand: 'Tramazac', unit: 'Strip', basePrice: 70, range: 50 },
  
  { prefix: 'Nise', generic: 'Nimesulide', category: 'Tablets', brand: 'Nise', unit: 'Strip', basePrice: 65, range: 45 },
  { prefix: 'Nimulid', generic: 'Nimesulide', category: 'Tablets', brand: 'Nimulid', unit: 'Strip', basePrice: 55, range: 40 },
  
  { prefix: 'Amox', generic: 'Amoxicillin', category: 'Capsules', brand: 'Amox', unit: 'Strip', basePrice: 35, range: 40 },
  { prefix: 'Amoxil', generic: 'Amoxicillin', category: 'Capsules', brand: 'Amoxil', unit: 'Strip', basePrice: 40, range: 50 },
  { prefix: 'Mox', generic: 'Amoxicillin', category: 'Capsules', brand: 'Mox', unit: 'Strip', basePrice: 38, range: 45 },
  { prefix: 'Novamox', generic: 'Amoxicillin', category: 'Capsules', brand: 'Novamox', unit: 'Strip', basePrice: 42, range: 48 },
  
  { prefix: 'Clavam', generic: 'Amoxicillin + Potassium Clavulanate', category: 'Tablets', brand: 'Clavam', unit: 'Strip', basePrice: 120, range: 100 },
  { prefix: 'Augmentin', generic: 'Amoxicillin + Potassium Clavulanate', category: 'Tablets', brand: 'Augmentin', unit: 'Strip', basePrice: 130, range: 120 },
  { prefix: 'Moxikind-CV', generic: 'Amoxicillin + Potassium Clavulanate', category: 'Tablets', brand: 'Moxikind', unit: 'Strip', basePrice: 110, range: 90 },
  { prefix: 'Advent', generic: 'Amoxicillin + Potassium Clavulanate', category: 'Tablets', brand: 'Advent', unit: 'Strip', basePrice: 115, range: 95 },
  
  { prefix: 'Azee', generic: 'Azithromycin', category: 'Tablets', brand: 'Azee', unit: 'Strip', basePrice: 60, range: 90 },
  { prefix: 'Azithral', generic: 'Azithromycin', category: 'Tablets', brand: 'Azithral', unit: 'Strip', basePrice: 70, range: 100 },
  { prefix: 'Azax', generic: 'Azithromycin', category: 'Tablets', brand: 'Azax', unit: 'Strip', basePrice: 55, range: 80 },
  
  { prefix: 'Zifi', generic: 'Cefixime', category: 'Tablets', brand: 'Zifi', unit: 'Strip', basePrice: 75, range: 75 },
  { prefix: 'Taxim-O', generic: 'Cefixime', category: 'Tablets', brand: 'Taxim-O', unit: 'Strip', basePrice: 80, range: 80 },
  { prefix: 'Cefolac', generic: 'Cefixime', category: 'Tablets', brand: 'Cefolac', unit: 'Strip', basePrice: 70, range: 70 },
  { prefix: 'Milixim', generic: 'Cefixime', category: 'Tablets', brand: 'Milixim', unit: 'Strip', basePrice: 72, range: 75 },
  
  { prefix: 'Gepod', generic: 'Cefpodoxime Proxetil', category: 'Tablets', brand: 'Gepod', unit: 'Strip', basePrice: 90, range: 80 },
  { prefix: 'Monocef-O', generic: 'Cefpodoxime Proxetil', category: 'Tablets', brand: 'Monocef-O', unit: 'Strip', basePrice: 120, range: 90 },
  { prefix: 'Macpod', generic: 'Cefpodoxime Proxetil', category: 'Tablets', brand: 'Macpod', unit: 'Strip', basePrice: 110, range: 80 },
  
  { prefix: 'Oflomac', generic: 'Ofloxacin', category: 'Tablets', brand: 'Oflomac', unit: 'Strip', basePrice: 40, range: 40 },
  { prefix: 'Oframax', generic: 'Ofloxacin', category: 'Tablets', brand: 'Oframax', unit: 'Strip', basePrice: 45, range: 45 },
  { prefix: 'Oflotas', generic: 'Ofloxacin', category: 'Tablets', brand: 'Oflotas', unit: 'Strip', basePrice: 38, range: 35 },
  { prefix: 'Oflomac-OZ', generic: 'Ofloxacin + Ornidazole', category: 'Tablets', brand: 'Oflomac', unit: 'Strip', basePrice: 75, range: 60 },
  { prefix: 'Zenflox-OZ', generic: 'Ofloxacin + Ornidazole', category: 'Tablets', brand: 'Zenflox', unit: 'Strip', basePrice: 85, range: 65 },
  
  { prefix: 'Norflox', generic: 'Norfloxacin', category: 'Tablets', brand: 'Norflox', unit: 'Strip', basePrice: 50, range: 35 },
  { prefix: 'Norflox-TZ', generic: 'Norfloxacin + Tinidazole', category: 'Tablets', brand: 'Norflox', unit: 'Strip', basePrice: 70, range: 45 },
  
  { prefix: 'Ciplox', generic: 'Ciprofloxacin', category: 'Tablets', brand: 'Ciplox', unit: 'Strip', basePrice: 25, range: 30 },
  { prefix: 'Ciprobid', generic: 'Ciprofloxacin', category: 'Tablets', brand: 'Ciprobid', unit: 'Strip', basePrice: 28, range: 32 },
  
  { prefix: 'Atorva', generic: 'Atorvastatin', category: 'Tablets', brand: 'Atorva', unit: 'Strip', basePrice: 45, range: 120 },
  { prefix: 'Lipitor', generic: 'Atorvastatin', category: 'Tablets', brand: 'Lipitor', unit: 'Strip', basePrice: 150, range: 250 },
  { prefix: 'Lipikind', generic: 'Atorvastatin', category: 'Tablets', brand: 'Lipikind', unit: 'Strip', basePrice: 35, range: 80 },
  { prefix: 'Tonact', generic: 'Atorvastatin', category: 'Tablets', brand: 'Tonact', unit: 'Strip', basePrice: 50, range: 110 },
  
  { prefix: 'Rosuvas', generic: 'Rosuvastatin', category: 'Tablets', brand: 'Rosuvas', unit: 'Strip', basePrice: 80, range: 180 },
  { prefix: 'Rosyn', generic: 'Rosuvastatin', category: 'Tablets', brand: 'Rosyn', unit: 'Strip', basePrice: 70, range: 150 },
  { prefix: 'Roseday', generic: 'Rosuvastatin', category: 'Tablets', brand: 'Roseday', unit: 'Strip', basePrice: 90, range: 190 },
  { prefix: 'Crevast', generic: 'Rosuvastatin', category: 'Tablets', brand: 'Crevast', unit: 'Strip', basePrice: 75, range: 160 },
  
  { prefix: 'Telma', generic: 'Telmisartan', category: 'Tablets', brand: 'Telma', unit: 'Strip', basePrice: 45, range: 110 },
  { prefix: 'Telvas', generic: 'Telmisartan', category: 'Tablets', brand: 'Telvas', unit: 'Strip', basePrice: 38, range: 90 },
  { prefix: 'Telsar', generic: 'Telmisartan', category: 'Tablets', brand: 'Telsar', unit: 'Strip', basePrice: 40, range: 95 },
  { prefix: 'Telma-H', generic: 'Telmisartan + Hydrochlorothiazide', category: 'Tablets', brand: 'Telma', unit: 'Strip', basePrice: 65, range: 120 },
  { prefix: 'Telvas-H', generic: 'Telmisartan + Hydrochlorothiazide', category: 'Tablets', brand: 'Telvas', unit: 'Strip', basePrice: 55, range: 100 },
  
  { prefix: 'Amlokind', generic: 'Amlodipine', category: 'Tablets', brand: 'Amlokind', unit: 'Strip', basePrice: 12, range: 25 },
  { prefix: 'Amlosafe', generic: 'Amlodipine', category: 'Tablets', brand: 'Amlosafe', unit: 'Strip', basePrice: 15, range: 30 },
  { prefix: 'Amlovas', generic: 'Amlodipine', category: 'Tablets', brand: 'Amlovas', unit: 'Strip', basePrice: 14, range: 28 },
  
  { prefix: 'Cilacar', generic: 'Cilnidipine', category: 'Tablets', brand: 'Cilacar', unit: 'Strip', basePrice: 60, range: 90 },
  { prefix: 'Cilnidac', generic: 'Cilnidipine', category: 'Tablets', brand: 'Cilnidac', unit: 'Strip', basePrice: 50, range: 80 },
  
  { prefix: 'Concor', generic: 'Bisoprolol Fumarate', category: 'Tablets', brand: 'Concor', unit: 'Strip', basePrice: 60, range: 120 },
  { prefix: 'Starpress', generic: 'Metoprolol Succinate', category: 'Tablets', brand: 'Starpress', unit: 'Strip', basePrice: 45, range: 90 },
  { prefix: 'Metolar', generic: 'Metoprolol Tartrate', category: 'Tablets', brand: 'Metolar', unit: 'Strip', basePrice: 35, range: 80 },
  
  { prefix: 'Glycomet', generic: 'Metformin Hydrochloride', category: 'Tablets', brand: 'Glycomet', unit: 'Strip', basePrice: 15, range: 35 },
  { prefix: 'Metformin SR', generic: 'Metformin Hydrochloride', category: 'Tablets', brand: 'Metformin', unit: 'Strip', basePrice: 12, range: 25 },
  { prefix: 'Glycomet GP', generic: 'Glimepiride + Metformin', category: 'Tablets', brand: 'Glycomet GP', unit: 'Strip', basePrice: 40, range: 110 },
  { prefix: 'Amaryl M', generic: 'Glimepiride + Metformin', category: 'Tablets', brand: 'Amaryl', unit: 'Strip', basePrice: 80, range: 150 },
  { prefix: 'Glimisave M', generic: 'Glimepiride + Metformin', category: 'Tablets', brand: 'Glimisave', unit: 'Strip', basePrice: 35, range: 90 },
  
  { prefix: 'Jalra-M', generic: 'Vildagliptin + Metformin', category: 'Tablets', brand: 'Jalra-M', unit: 'Strip', basePrice: 160, range: 180 },
  { prefix: 'Galvus Met', generic: 'Vildagliptin + Metformin', category: 'Tablets', brand: 'Galvus', unit: 'Strip', basePrice: 220, range: 250 },
  { prefix: 'Ziten M', generic: 'Teneligliptin + Metformin', category: 'Tablets', brand: 'Ziten', unit: 'Strip', basePrice: 90, range: 110 },
  { prefix: 'Dynaglipt M', generic: 'Teneligliptin + Metformin', category: 'Tablets', brand: 'Dynaglipt', unit: 'Strip', basePrice: 85, range: 100 },
  
  { prefix: 'Voglistar', generic: 'Voglibose', category: 'Tablets', brand: 'Voglistar', unit: 'Strip', basePrice: 40, range: 60 },
  { prefix: 'Volibo', generic: 'Voglibose', category: 'Tablets', brand: 'Volibo', unit: 'Strip', basePrice: 45, range: 65 },
  
  { prefix: 'Pantocid', generic: 'Pantoprazole', category: 'Tablets', brand: 'Pantocid', unit: 'Strip', basePrice: 60, range: 110 },
  { prefix: 'Pan', generic: 'Pantoprazole', category: 'Tablets', brand: 'Pan', unit: 'Strip', basePrice: 70, range: 120 },
  { prefix: 'Pantodac', generic: 'Pantoprazole', category: 'Tablets', brand: 'Pantodac', unit: 'Strip', basePrice: 55, range: 100 },
  { prefix: 'Pan-D', generic: 'Pantoprazole + Domperidone', category: 'Capsules', brand: 'Pan-D', unit: 'Strip', basePrice: 110, range: 120 },
  { prefix: 'Pantocid-DSR', generic: 'Pantoprazole + Domperidone', category: 'Capsules', brand: 'Pantocid', unit: 'Strip', basePrice: 120, range: 130 },
  { prefix: 'Pantosec-DSR', generic: 'Pantoprazole + Domperidone', category: 'Capsules', brand: 'Pantosec', unit: 'Strip', basePrice: 105, range: 110 },
  
  { prefix: 'Omez', generic: 'Omeprazole', category: 'Capsules', brand: 'Omez', unit: 'Strip', basePrice: 30, range: 50 },
  { prefix: 'Omecip', generic: 'Omeprazole', category: 'Capsules', brand: 'Omecip', unit: 'Strip', basePrice: 25, range: 45 },
  { prefix: 'Omez-D', generic: 'Omeprazole + Domperidone', category: 'Capsules', brand: 'Omez', unit: 'Strip', basePrice: 55, range: 70 },
  
  { prefix: 'Rabicip', generic: 'Rabeprazole', category: 'Tablets', brand: 'Rabicip', unit: 'Strip', basePrice: 45, range: 80 },
  { prefix: 'Rabeloc', generic: 'Rabeprazole', category: 'Tablets', brand: 'Rabeloc', unit: 'Strip', basePrice: 50, range: 85 },
  { prefix: 'Rabicip-DSR', generic: 'Rabeprazole + Domperidone', category: 'Capsules', brand: 'Rabicip', unit: 'Strip', basePrice: 95, range: 110 },
  { prefix: 'Razo-DSR', generic: 'Rabeprazole + Domperidone', category: 'Capsules', brand: 'Razo', unit: 'Strip', basePrice: 110, range: 130 },
  
  { prefix: 'Sompraz', generic: 'Esomeprazole', category: 'Tablets', brand: 'Sompraz', unit: 'Strip', basePrice: 65, range: 110 },
  { prefix: 'Nexpro', generic: 'Esomeprazole', category: 'Tablets', brand: 'Nexpro', unit: 'Strip', basePrice: 60, range: 105 },
  { prefix: 'Sompraz-DSR', generic: 'Esomeprazole + Domperidone', category: 'Capsules', brand: 'Sompraz', unit: 'Strip', basePrice: 115, range: 130 },
  { prefix: 'Nexpro-RD', generic: 'Esomeprazole + Domperidone', category: 'Capsules', brand: 'Nexpro', unit: 'Strip', basePrice: 110, range: 125 },
  
  { prefix: 'Aciloc', generic: 'Ranitidine', category: 'Tablets', brand: 'Aciloc', unit: 'Strip', basePrice: 12, range: 30 },
  { prefix: 'Rantac', generic: 'Ranitidine', category: 'Tablets', brand: 'Rantac', unit: 'Strip', basePrice: 15, range: 32 },
  { prefix: 'Zinetac', generic: 'Ranitidine', category: 'Tablets', brand: 'Zinetac', unit: 'Strip', basePrice: 14, range: 28 },
  
  { prefix: 'Okacet', generic: 'Cetirizine', category: 'Tablets', brand: 'Okacet', unit: 'Strip', basePrice: 10, range: 20 },
  { prefix: 'Cetcip', generic: 'Cetirizine', category: 'Tablets', brand: 'Cetcip', unit: 'Strip', basePrice: 12, range: 18 },
  { prefix: 'Alerid', generic: 'Cetirizine', category: 'Tablets', brand: 'Alerid', unit: 'Strip', basePrice: 14, range: 22 },
  
  { prefix: 'Teczine', generic: 'Levocetirizine', category: 'Tablets', brand: 'Teczine', unit: 'Strip', basePrice: 35, range: 45 },
  { prefix: 'Lecope', generic: 'Levocetirizine', category: 'Tablets', brand: 'Lecope', unit: 'Strip', basePrice: 28, range: 40 },
  { prefix: 'Sizloc', generic: 'Levocetirizine', category: 'Tablets', brand: 'Sizloc', unit: 'Strip', basePrice: 30, range: 42 },
  
  { prefix: 'Montair-LC', generic: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Montair', unit: 'Strip', basePrice: 130, range: 130 },
  { prefix: 'Telekast-L', generic: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Telekast', unit: 'Strip', basePrice: 120, range: 110 },
  { prefix: 'Montemac-L', generic: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Montemac', unit: 'Strip', basePrice: 110, range: 100 },
  { prefix: 'Montek-LC', generic: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Montek', unit: 'Strip', basePrice: 125, range: 115 },
  
  { prefix: 'Allegra', generic: 'Fexofenadine Hydrochloride', category: 'Tablets', brand: 'Allegra', unit: 'Strip', basePrice: 110, range: 120 },
  { prefix: 'Fexo', generic: 'Fexofenadine Hydrochloride', category: 'Tablets', brand: 'Fexo', unit: 'Strip', basePrice: 70, range: 90 },
  { prefix: 'Fexigra', generic: 'Fexofenadine Hydrochloride', category: 'Tablets', brand: 'Fexigra', unit: 'Strip', basePrice: 75, range: 95 },
  
  { prefix: 'Avil', generic: 'Pheniramine Maleate', category: 'Tablets', brand: 'Avil', unit: 'Strip', basePrice: 8, range: 10 },
  { prefix: 'Atarax', generic: 'Hydroxyzine Hydrochloride', category: 'Tablets', brand: 'Atarax', unit: 'Strip', basePrice: 50, range: 60 },
  
  { prefix: 'Becosules', generic: 'Vitamin B Complex + Vitamin C', category: 'Capsules', brand: 'Becosules', unit: 'Strip', basePrice: 25, range: 25 },
  { prefix: 'Cobadex Forte', generic: 'Vitamin B Complex + Zinc', category: 'Capsules', brand: 'Cobadex', unit: 'Strip', basePrice: 22, range: 20 },
  { prefix: 'Zincovit', generic: 'Multivitamin + Multimineral', category: 'Tablets', brand: 'Zincovit', unit: 'Strip', basePrice: 75, range: 60 },
  { prefix: 'Revital H', generic: 'Multivitamins + Minerals + Ginseng', category: 'Capsules', brand: 'Revital', unit: 'Strip', basePrice: 180, range: 150 },
  { prefix: 'Limcee Orange', generic: 'Vitamin C (Ascorbic Acid)', category: 'Tablets', brand: 'Limcee', unit: 'Strip', basePrice: 15, range: 15 },
  { prefix: 'Celin chewable', generic: 'Vitamin C (Ascorbic Acid)', category: 'Tablets', brand: 'Celin', unit: 'Strip', basePrice: 18, range: 15 },
  
  { prefix: 'Shelcal', generic: 'Calcium + Vitamin D3', category: 'Tablets', brand: 'Shelcal', unit: 'Strip', basePrice: 80, range: 70 },
  { prefix: 'Cipcal', generic: 'Calcium + Vitamin D3', category: 'Tablets', brand: 'Cipcal', unit: 'Strip', basePrice: 70, range: 60 },
  { prefix: 'Calcirol Sachet', generic: 'Cholecalciferol (Vitamin D3)', category: 'Others', brand: 'Calcirol', unit: 'Sachet', basePrice: 25, range: 20 },
  { prefix: 'D3-Must', generic: 'Cholecalciferol (Vitamin D3)', category: 'Capsules', brand: 'D3-Must', unit: 'Strip', basePrice: 24, range: 25 },
  
  { prefix: 'Evion', generic: 'Vitamin E', category: 'Capsules', brand: 'Evion', unit: 'Strip', basePrice: 25, range: 40 },
  { prefix: 'Neurobion Forte', generic: 'Vitamin B Complex + Methylcobalamin', category: 'Tablets', brand: 'Neurobion', unit: 'Strip', basePrice: 25, range: 20 },
  { prefix: 'Mecobon', generic: 'Methylcobalamin', category: 'Tablets', brand: 'Mecobon', unit: 'Strip', basePrice: 90, range: 80 },
  
  { prefix: 'Asthalin', generic: 'Salbutamol', category: 'Inhalers', brand: 'Asthalin', unit: 'Piece', basePrice: 100, range: 50 },
  { prefix: 'Duolin', generic: 'Levosalbutamol + Ipratropium Bromide', category: 'Inhalers', brand: 'Duolin', unit: 'Piece', basePrice: 210, range: 90 },
  { prefix: 'Budecort', generic: 'Budesonide', category: 'Inhalers', brand: 'Budecort', unit: 'Piece', basePrice: 180, range: 120 },
  { prefix: 'Foracort', generic: 'Budesonide + Formoterol Fumarate', category: 'Inhalers', brand: 'Foracort', unit: 'Piece', basePrice: 220, range: 150 },
  
  { prefix: 'Benadryl Syrup', generic: 'Diphenhydramine + Ammonium Chloride + Sodium Citrate', category: 'Syrups', brand: 'Benadryl', unit: 'Bottle', basePrice: 85, range: 60 },
  { prefix: 'Ascoril LS Syrup', generic: 'Ambroxol + Levosalbutamol + Guaiphenesin', category: 'Syrups', brand: 'Ascoril', unit: 'Bottle', basePrice: 90, range: 50 },
  { prefix: 'Grilinctus Syrup', generic: 'Dextromethorphan + Chlorpheniramine', category: 'Syrups', brand: 'Grilinctus', unit: 'Bottle', basePrice: 85, range: 45 },
  { prefix: 'Corex DX Syrup', generic: 'Chlorpheniramine + Dextromethorphan', category: 'Syrups', brand: 'Corex', unit: 'Bottle', basePrice: 95, range: 55 },
  { prefix: 'Solvin Cold Syrup', generic: 'Paracetamol + Phenylephrine + Chlorpheniramine', category: 'Syrups', brand: 'Solvin', unit: 'Bottle', basePrice: 65, range: 35 },
  
  { prefix: 'Volini Gel', generic: 'Diclofenac + Methyl Salicylate + Menthol', category: 'Others', brand: 'Volini', unit: 'Piece', basePrice: 45, range: 110 },
  { prefix: 'Moov Gel', generic: 'Oil of Wintergreen + Menthol + Turpentine Oil', category: 'Others', brand: 'Moov', unit: 'Piece', basePrice: 50, range: 100 },
  { prefix: 'Iodex Balm', generic: 'Methyl Salicylate + Menthol + Camphor', category: 'Others', brand: 'Iodex', unit: 'Piece', basePrice: 35, range: 80 },
  
  { prefix: 'Betnovate-N', generic: 'Betamethasone + Neomycin', category: 'Others', brand: 'Betnovate', unit: 'Piece', basePrice: 35, range: 25 },
  { prefix: 'Betnovate-C', generic: 'Betamethasone + Clioquinol', category: 'Others', brand: 'Betnovate', unit: 'Piece', basePrice: 38, range: 25 },
  { prefix: 'Betnovate-GM', generic: 'Betamethasone + Gentamicin + Miconazole', category: 'Others', brand: 'Betnovate', unit: 'Piece', basePrice: 42, range: 30 },
  { prefix: 'Quadriderm RF', generic: 'Beclomethasone + Clotrimazole + Neomycin', category: 'Others', brand: 'Quadriderm', unit: 'Piece', basePrice: 65, range: 40 },
  { prefix: 'Panderm Super', generic: 'Clobetasol + Neomycin + Miconazole', category: 'Others', brand: 'Panderm', unit: 'Piece', basePrice: 70, range: 45 },
  { prefix: 'Tenovate Cream', generic: 'Clobetasol Propionate', category: 'Others', brand: 'Tenovate', unit: 'Piece', basePrice: 45, range: 35 },
  
  { prefix: 'Ciplox Eye/Ear Drops', generic: 'Ciprofloxacin Eye Drops', category: 'Drops', brand: 'Ciplox', unit: 'Piece', basePrice: 15, range: 15 },
  { prefix: 'Moxicip Eye Drops', generic: 'Moxifloxacin Eye Drops', category: 'Drops', brand: 'Moxicip', unit: 'Piece', basePrice: 45, range: 35 },
  { prefix: 'Otrivin Nasal Spray', generic: 'Xylometazoline Hydrochloride', category: 'Drops', brand: 'Otrivin', unit: 'Piece', basePrice: 65, range: 40 },
  { prefix: 'Nasoclear Drops', generic: 'Sodium Chloride Nasal Solution', category: 'Drops', brand: 'Nasoclear', unit: 'Piece', basePrice: 35, range: 20 },
];

const dosageSuffixes = [
  '5mg', '10mg', '20mg', '40mg', '50mg', '75mg', '80mg', '100mg', '150mg', '200mg', '250mg', '300mg', '400mg', '500mg', '600mg', '625mg', '650mg', '1g', 'SR', 'DSR', 'XL', 'Duo', 'Kid', 'Plus', 'Forte'
];

// Let's generate 5150 high-quality medical products
const dataset = [];

// Header Row
dataset.push('Name,Generic Name,Category,Brand,Manufacturer,MRP,Purchase Price,Selling Price,Unit');

for (let i = 0; i < 5150; i++) {
  const template = medicineTemplates[i % medicineTemplates.length];
  const mfg = manufacturers[i % manufacturers.length];
  
  // Create a realistic dosage & form suffix
  let dose = dosageSuffixes[Math.floor((i * 17) % dosageSuffixes.length)];
  
  // Make sure we don't end up with "Asthalin Inhaler 650mg" -> keep suffixes relevant to category
  if (template.category === 'Inhalers' || template.unit === 'Piece') {
    if (Math.random() > 0.5) {
      dose = 'Inhaler';
    } else {
      dose = 'Respules';
    }
  } else if (template.category === 'Syrups') {
    dose = (i % 2 === 0) ? '100ml Syrup' : '60ml Syrup';
  } else if (template.category === 'Drops') {
    dose = '5ml Drops';
  } else if (template.category === 'Ointments') {
    dose = (i % 2 === 0) ? '15g Gel' : '30g Cream';
  }

  // Create highly varied distinct names
  let pName = `${template.prefix} ${dose}`;
  
  // Add some random variation in product index so there are no exact duplicates
  const indexVariation = Math.floor(i / medicineTemplates.length);
  if (indexVariation > 0) {
    pName += ` (Batch ${indexVariation})`;
  }

  // Calculate realistic Indian Pricing (MRP is highest, Selling Price is slightly less, Purchase Price is ~70-80% of selling)
  const mrp = Math.round((template.basePrice + ((i * 13) % template.range)) * 10) / 10;
  const sellingPrice = Math.round((mrp * 0.85) * 10) / 10;
  const purchasePrice = Math.round((sellingPrice * 0.78) * 10) / 10;

  // Escape fields that might have commas (like dual generic names)
  const escapedName = `"${pName.replace(/"/g, '""')}"`;
  const escapedGeneric = `"${template.generic.replace(/"/g, '""')}"`;
  const escapedCategory = `"${template.category.replace(/"/g, '""')}"`;
  const escapedBrand = `"${template.brand.replace(/"/g, '""')}"`;
  const escapedMfg = `"${mfg.replace(/"/g, '""')}"`;
  const escapedUnit = `"${template.unit.replace(/"/g, '""')}"`;

  dataset.push(`${escapedName},${escapedGeneric},${escapedCategory},${escapedBrand},${escapedMfg},${mrp},${purchasePrice},${sellingPrice},${escapedUnit}`);
}

fs.writeFileSync(csvPath, dataset.join('\n'), 'utf-8');
console.log(`Generated pharmaflow_medicines_master.csv successfully with ${dataset.length - 1} medicines!`);
