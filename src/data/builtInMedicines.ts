export interface BuiltInMedicine {
  name: string;
  genericName: string;
  category: string;
  brand: string;
  manufacturer: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  unit: string;
}

export const builtInMedicines: BuiltInMedicine[] = [
  // Analgesics & Antipyretics
  { name: 'Calpol 650mg Tablet', genericName: 'Paracetamol', category: 'Tablets', brand: 'Calpol', manufacturer: 'GSK', purchasePrice: 24.5, sellingPrice: 30.0, mrp: 33.6, unit: 'Strip' },
  { name: 'Calpol 500mg Tablet', genericName: 'Paracetamol', category: 'Tablets', brand: 'Calpol', manufacturer: 'GSK', purchasePrice: 12.2, sellingPrice: 15.5, mrp: 18.2, unit: 'Strip' },
  { name: 'Crocin Pain Relief Tablet', genericName: 'Paracetamol + Caffeine', category: 'Tablets', brand: 'Crocin', manufacturer: 'GlaxoSmithKline', purchasePrice: 48.0, sellingPrice: 58.0, mrp: 64.5, unit: 'Strip' },
  { name: 'Crocin Advance 500mg', genericName: 'Paracetamol', category: 'Tablets', brand: 'Crocin', manufacturer: 'GSK', purchasePrice: 14.5, sellingPrice: 18.0, mrp: 21.0, unit: 'Strip' },
  { name: 'Combiflam Tablet', genericName: 'Ibuprofen + Paracetamol', category: 'Tablets', brand: 'Combiflam', manufacturer: 'Sanofi India', purchasePrice: 32.0, sellingPrice: 40.0, mrp: 45.3, unit: 'Strip' },
  { name: 'Meftal-Spas Tablet', genericName: 'Mefenamic Acid + Dicyclomine', category: 'Tablets', brand: 'Meftal-Spas', manufacturer: 'Blue Cross', purchasePrice: 38.0, sellingPrice: 47.0, mrp: 52.0, unit: 'Strip' },
  { name: 'Dolo 650 Tablet', genericName: 'Paracetamol', category: 'Tablets', brand: 'Dolo', manufacturer: 'Micro Labs', purchasePrice: 26.0, sellingPrice: 31.0, mrp: 34.2, unit: 'Strip' },
  { name: 'Saridon Tablet', genericName: 'Paracetamol + Propyphenazone + Caffeine', category: 'Tablets', brand: 'Saridon', manufacturer: 'Bayer', purchasePrice: 35.0, sellingPrice: 42.0, mrp: 46.5, unit: 'Strip' },
  { name: 'Ultracet Tablet', genericName: 'Tramadol + Paracetamol', category: 'Tablets', brand: 'Ultracet', manufacturer: 'Janssen', purchasePrice: 180.0, sellingPrice: 210.0, mrp: 232.0, unit: 'Strip' },
  { name: 'Flexon Tablet', genericName: 'Ibuprofen + Paracetamol', category: 'Tablets', brand: 'Flexon', manufacturer: 'Aristo Pharma', purchasePrice: 22.0, sellingPrice: 28.0, mrp: 31.5, unit: 'Strip' },
  { name: 'Nise 100mg Tablet', genericName: 'Nimesulide', category: 'Tablets', brand: 'Nise', manufacturer: 'Dr. Reddy s', purchasePrice: 75.0, sellingPrice: 92.0, mrp: 104.0, unit: 'Strip' },

  // Antihistamines & Allergy
  { name: 'Allegra 120mg Tablet', genericName: 'Fexofenadine Hydrochloride', category: 'Tablets', brand: 'Allegra', manufacturer: 'Sanofi', purchasePrice: 145.0, sellingPrice: 180.0, mrp: 202.0, unit: 'Strip' },
  { name: 'Allegra 180mg Tablet', genericName: 'Fexofenadine Hydrochloride', category: 'Tablets', brand: 'Allegra', manufacturer: 'Sanofi', purchasePrice: 175.0, sellingPrice: 210.0, mrp: 235.0, unit: 'Strip' },
  { name: 'Avil 25mg Tablet', genericName: 'Pheniramine Maleate', category: 'Tablets', brand: 'Avil', manufacturer: 'Sanofi India', purchasePrice: 8.5, sellingPrice: 11.0, mrp: 12.8, unit: 'Strip' },
  { name: 'Okacet Tablet', genericName: 'Cetirizine', category: 'Tablets', brand: 'Okacet', manufacturer: 'Cipla', purchasePrice: 14.0, sellingPrice: 18.0, mrp: 22.0, unit: 'Strip' },
  { name: 'Teczine 5mg Tablet', genericName: 'Levocetirizine', category: 'Tablets', brand: 'Teczine', manufacturer: 'Cipla', purchasePrice: 42.0, sellingPrice: 55.0, mrp: 62.5, unit: 'Strip' },
  { name: 'Montair LC Tablet', genericName: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Montair', manufacturer: 'Cipla', purchasePrice: 180.0, sellingPrice: 220.0, mrp: 245.0, unit: 'Strip' },
  { name: 'Telekast L Tablet', genericName: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Telekast', manufacturer: 'Lupin', purchasePrice: 165.0, sellingPrice: 195.0, mrp: 218.0, unit: 'Strip' },

  // Acid Reflux & Gastrointestinal
  { name: 'Pantocid 40mg Tablet', genericName: 'Pantoprazole', category: 'Tablets', brand: 'Pantocid', manufacturer: 'Sun Pharma', purchasePrice: 110.0, sellingPrice: 140.0, mrp: 155.0, unit: 'Strip' },
  { name: 'Pan-D Capsule', genericName: 'Pantoprazole + Domperidone', category: 'Capsules', brand: 'Pan-D', manufacturer: 'Alkem Labs', purchasePrice: 150.0, sellingPrice: 188.0, mrp: 205.0, unit: 'Strip' },
  { name: 'Omez 20mg Capsule', genericName: 'Omeprazole', category: 'Capsules', brand: 'Omez', manufacturer: 'Dr. Reddy s', purchasePrice: 45.0, sellingPrice: 58.0, mrp: 65.0, unit: 'Strip' },
  { name: 'Omez-D Capsule', genericName: 'Omeprazole + Domperidone', category: 'Capsules', brand: 'Omez', manufacturer: 'Dr. Reddy s', purchasePrice: 65.0, sellingPrice: 82.0, mrp: 92.5, unit: 'Strip' },
  { name: 'Aciloc 150mg Tablet', genericName: 'Ranitidine', category: 'Tablets', brand: 'Aciloc', manufacturer: 'Cadila Pharma', purchasePrice: 18.0, sellingPrice: 24.0, mrp: 28.5, unit: 'Strip' },
  { name: 'Aciloc 300mg Tablet', genericName: 'Ranitidine', category: 'Tablets', brand: 'Aciloc', manufacturer: 'Cadila Pharma', purchasePrice: 32.0, sellingPrice: 40.0, mrp: 46.0, unit: 'Strip' },
  { name: 'Zinetac 150mg', genericName: 'Ranitidine', category: 'Tablets', brand: 'Zinetac', manufacturer: 'GSK', purchasePrice: 20.0, sellingPrice: 26.0, mrp: 30.0, unit: 'Strip' },
  { name: 'Digene Mint Syrup 200ml', genericName: 'Magnesium Hydroxide + Aluminium Hydroxide + Simethicone', category: 'Syrups', brand: 'Digene', manufacturer: 'Abbott India', purchasePrice: 120.0, sellingPrice: 148.0, mrp: 162.0, unit: 'Bottle' },
  { name: 'Eldoper Capsule', genericName: 'Loperamide', category: 'Capsules', brand: 'Eldoper', manufacturer: 'Micro Labs', purchasePrice: 18.0, sellingPrice: 23.0, mrp: 26.5, unit: 'Strip' },
  { name: 'Rantac 150 Tablet', genericName: 'Ranitidine', category: 'Tablets', brand: 'Rantac', manufacturer: 'J.B. Chemicals', purchasePrice: 19.5, sellingPrice: 25.0, mrp: 29.0, unit: 'Strip' },
  { name: 'Spasmo-Proxyvon Plus Capsule', genericName: 'Dicyclomine + Tramadol + Acetaminophen', category: 'Capsules', brand: 'Spasmo-Proxyvon', manufacturer: 'Wockhardt', purchasePrice: 62.0, sellingPrice: 78.0, mrp: 86.0, unit: 'Strip' },

  // Cardiovascular & Anti-hypertensives
  { name: 'Telma 40 Tablet', genericName: 'Telmisartan', category: 'Tablets', brand: 'Telma', manufacturer: 'Glenmark', purchasePrice: 68.0, sellingPrice: 85.0, mrp: 96.0, unit: 'Strip' },
  { name: 'Telma 80 Tablet', genericName: 'Telmisartan', category: 'Tablets', brand: 'Telma', manufacturer: 'Glenmark', purchasePrice: 110.0, sellingPrice: 140.0, mrp: 156.0, unit: 'Strip' },
  { name: 'Telma-H Tablet', genericName: 'Telmisartan + Hydrochlorothiazide', category: 'Tablets', brand: 'Telma', manufacturer: 'Glenmark', purchasePrice: 82.0, sellingPrice: 105.0, mrp: 118.0, unit: 'Strip' },
  { name: 'Amlokind 5 Tablet', genericName: 'Amlodipine', category: 'Tablets', brand: 'Amlokind', manufacturer: 'Mankind Pharma', purchasePrice: 15.0, sellingPrice: 20.0, mrp: 24.5, unit: 'Strip' },
  { name: 'Amlodac 5 Tablet', genericName: 'Amlodipine', category: 'Tablets', brand: 'Amlodac', manufacturer: 'Zydus Cadila', purchasePrice: 22.0, sellingPrice: 28.0, mrp: 32.0, unit: 'Strip' },
  { name: 'Concor 5 Tablet', genericName: 'Bisoprolol Fumarate', category: 'Tablets', brand: 'Concor', manufacturer: 'Merck', purchasePrice: 95.0, sellingPrice: 120.0, mrp: 134.0, unit: 'Strip' },
  { name: 'Lipitor 10mg Tablet', genericName: 'Atorvastatin', category: 'Tablets', brand: 'Lipitor', manufacturer: 'Pfizer', purchasePrice: 210.0, sellingPrice: 260.0, mrp: 290.0, unit: 'Strip' },
  { name: 'Atorva 10 Tablet', genericName: 'Atorvastatin', category: 'Tablets', brand: 'Atorva', manufacturer: 'Zydus', purchasePrice: 65.0, sellingPrice: 82.0, mrp: 94.0, unit: 'Strip' },
  { name: 'Atorva 20 Tablet', genericName: 'Atorvastatin', category: 'Tablets', brand: 'Atorva', manufacturer: 'Zydus', purchasePrice: 120.0, sellingPrice: 150.0, mrp: 168.0, unit: 'Strip' },
  { name: 'Rosuvas 10 Tablet', genericName: 'Rosuvastatin', category: 'Tablets', brand: 'Rosuvas', manufacturer: 'Sun Pharma', purchasePrice: 135.0, sellingPrice: 168.0, mrp: 188.0, unit: 'Strip' },
  { name: 'Ecosprin 75 Tablet', genericName: 'Aspirin', category: 'Tablets', brand: 'Ecosprin', manufacturer: 'USV Ltd', purchasePrice: 4.5, sellingPrice: 6.0, mrp: 7.2, unit: 'Strip' },
  { name: 'Ecosprin 150 Tablet', genericName: 'Aspirin', category: 'Tablets', brand: 'Ecosprin', manufacturer: 'USV Ltd', purchasePrice: 6.8, sellingPrice: 9.0, mrp: 10.5, unit: 'Strip' },

  // Antidiabetics
  { name: 'Glycomet 500 SR Tablet', genericName: 'Metformin Hydrochloride', category: 'Tablets', brand: 'Glycomet', manufacturer: 'USV Ltd', purchasePrice: 18.0, sellingPrice: 22.0, mrp: 25.8, unit: 'Strip' },
  { name: 'Glycomet GP 1 Tablet', genericName: 'Glimepiride + Metformin', category: 'Tablets', brand: 'Glycomet GP', manufacturer: 'USV Ltd', purchasePrice: 45.0, sellingPrice: 56.0, mrp: 64.0, unit: 'Strip' },
  { name: 'Glycomet GP 2 Tablet', genericName: 'Glimepiride + Metformin', category: 'Tablets', brand: 'Glycomet GP', manufacturer: 'USV Ltd', purchasePrice: 65.0, sellingPrice: 80.0, mrp: 92.0, unit: 'Strip' },
  { name: 'Jalra-M 50mg/500mg', genericName: 'Vildagliptin + Metformin', category: 'Tablets', brand: 'Jalra-M', manufacturer: 'USV', purchasePrice: 220.0, sellingPrice: 275.0, mrp: 304.0, unit: 'Strip' },
  { name: 'Glizid M Tablet', genericName: 'Gliclazide + Metformin', category: 'Tablets', brand: 'Glizid', manufacturer: 'Panacea Biotec', purchasePrice: 85.0, sellingPrice: 105.0, mrp: 118.0, unit: 'Strip' },

  // Antibiotics & Anti-infectives
  { name: 'Augmentin 625 DUO Tablet', genericName: 'Amoxicillin + Clavulanic Acid', category: 'Tablets', brand: 'Augmentin', manufacturer: 'GSK', purchasePrice: 145.0, sellingPrice: 178.0, mrp: 201.7, unit: 'Strip' },
  { name: 'Taxim-O 200 Tablet', genericName: 'Cefixime', category: 'Tablets', brand: 'Taxim-O', manufacturer: 'Alkem Labs', purchasePrice: 85.0, sellingPrice: 108.0, mrp: 121.5, unit: 'Strip' },
  { name: 'Azee 500 Tablet', genericName: 'Azithromycin', category: 'Tablets', brand: 'Azee', manufacturer: 'Cipla', purchasePrice: 90.0, sellingPrice: 112.0, mrp: 126.3, unit: 'Strip' },
  { name: 'Zifi 200 Tablet', genericName: 'Cefixime', category: 'Tablets', brand: 'Zifi', manufacturer: 'FDC Ltd', purchasePrice: 88.0, sellingPrice: 110.0, mrp: 124.0, unit: 'Strip' },
  { name: 'Clavam 625 Tablet', genericName: 'Amoxicillin + Clavulanic Acid', category: 'Tablets', brand: 'Clavam', manufacturer: 'Alkem Labs', purchasePrice: 142.0, sellingPrice: 175.0, mrp: 198.5, unit: 'Strip' },
  { name: 'Oflacin 200 Tablet', genericName: 'Ofloxacin', category: 'Tablets', brand: 'Oflacin', manufacturer: 'Ranbaxy', purchasePrice: 42.0, sellingPrice: 54.0, mrp: 61.0, unit: 'Strip' },
  { name: 'Norflox TZ Tablet', genericName: 'Norfloxacin + Tinidazole', category: 'Tablets', brand: 'Norflox', manufacturer: 'Cipla', purchasePrice: 72.0, sellingPrice: 90.0, mrp: 102.5, unit: 'Strip' },
  { name: 'Ciprobid 500 Tablet', genericName: 'Ciprofloxacin', category: 'Tablets', brand: 'Ciprobid', manufacturer: 'Zydus', purchasePrice: 32.0, sellingPrice: 41.0, mrp: 46.5, unit: 'Strip' },

  // Respiratory & Asthma
  { name: 'Asthalin Inhaler', genericName: 'Salbutamol', category: 'Inhalers', brand: 'Asthalin', manufacturer: 'Cipla', purchasePrice: 110.0, sellingPrice: 135.0, mrp: 152.0, unit: 'Piece' },
  { name: 'Duolin Inhaler', genericName: 'Levosalbutamol + Ipratropium Bromide', category: 'Inhalers', brand: 'Duolin', manufacturer: 'Cipla', purchasePrice: 240.0, sellingPrice: 285.0, mrp: 318.0, unit: 'Piece' },
  { name: 'Foracort 200 Rotacaps', genericName: 'Budesonide + Formoterol Fumarate', category: 'Inhalers', brand: 'Foracort', manufacturer: 'Cipla', purchasePrice: 195.0, sellingPrice: 240.0, mrp: 268.0, unit: 'Piece' },
  { name: 'Montek LC Kid Tablet', genericName: 'Montelukast + Levocetirizine', category: 'Tablets', brand: 'Montek', manufacturer: 'Sun Pharma', purchasePrice: 85.0, sellingPrice: 105.0, mrp: 116.0, unit: 'Strip' },

  // Vitamins, Minerals & Supplements
  { name: 'Becosules Capsule', genericName: 'Vitamin B Complex + Vitamin C', category: 'Capsules', brand: 'Becosules', manufacturer: 'Pfizer', purchasePrice: 32.0, sellingPrice: 40.0, mrp: 45.8, unit: 'Strip' },
  { name: 'Becosules Z Capsule', genericName: 'Vitamin B-Complex + Vitamin C + Zinc', category: 'Capsules', brand: 'Becosules', manufacturer: 'Pfizer', purchasePrice: 36.0, sellingPrice: 45.0, mrp: 51.0, unit: 'Strip' },
  { name: 'Shelcal 500 Tablet', genericName: 'Calcium + Vitamin D3', category: 'Tablets', brand: 'Shelcal', manufacturer: 'Torrent Pharma', purchasePrice: 92.0, sellingPrice: 115.0, mrp: 129.5, unit: 'Strip' },
  { name: 'Calcirol Sachet 1g', genericName: 'Cholecalciferol (Vitamin D3)', category: 'Others', brand: 'Calcirol', manufacturer: 'Cadila', purchasePrice: 28.0, sellingPrice: 35.0, mrp: 40.0, unit: 'Sachet' },
  { name: 'Evion 400 Capsule', genericName: 'Vitamin E', category: 'Capsules', brand: 'Evion', manufacturer: 'Merck', purchasePrice: 28.0, sellingPrice: 34.0, mrp: 38.5, unit: 'Strip' },
  { name: 'Evion 600 Capsule', genericName: 'Vitamin E', category: 'Capsules', brand: 'Evion', manufacturer: 'Merck', purchasePrice: 42.0, sellingPrice: 52.0, mrp: 59.0, unit: 'Strip' },
  { name: 'Neurobion Forte Tablet', genericName: 'Vitamin B Complex', category: 'Tablets', brand: 'Neurobion', manufacturer: 'Procter & Gamble', purchasePrice: 28.5, sellingPrice: 35.0, mrp: 39.8, unit: 'Strip' },
  { name: 'Limcee 500mg Orange', genericName: 'Vitamin C (Ascorbic Acid)', category: 'Tablets', brand: 'Limcee', manufacturer: 'Abbott', purchasePrice: 18.0, sellingPrice: 23.0, mrp: 26.2, unit: 'Strip' },
  { name: 'Zincovit Tablet', genericName: 'Multivitamin + Multimineral', category: 'Tablets', brand: 'Zincovit', manufacturer: 'Apex Labs', purchasePrice: 85.0, sellingPrice: 105.0, mrp: 118.0, unit: 'Strip' },
  { name: 'Revital H Capsule', genericName: 'Multivitamins + Minerals + Ginseng', category: 'Capsules', brand: 'Revital', manufacturer: 'Sun Pharma', purchasePrice: 220.0, sellingPrice: 270.0, mrp: 300.0, unit: 'Strip' },

  // Cough & Cold Syrups
  { name: 'Benadryl Cough Syrup 100ml', genericName: 'Diphenhydramine + Ammonium Chloride + Sodium Citrate', category: 'Syrups', brand: 'Benadryl', manufacturer: 'Kenvue', purchasePrice: 95.0, sellingPrice: 118.0, mrp: 129.0, unit: 'Bottle' },
  { name: 'Ascoril LS Syrup 100ml', genericName: 'Ambroxol + Levosalbutamol + Guaiphenesin', category: 'Syrups', brand: 'Ascoril', manufacturer: 'Glenmark', purchasePrice: 98.0, sellingPrice: 122.0, mrp: 134.0, unit: 'Bottle' },
  { name: 'Grilinctus Syrup 100ml', genericName: 'Dextromethorphan + Chlorpheniramine', category: 'Syrups', brand: 'Grilinctus', manufacturer: 'Franco-Indian', purchasePrice: 95.0, sellingPrice: 115.0, mrp: 128.0, unit: 'Bottle' },
  { name: 'Corex DX Syrup 100ml', genericName: 'Chlorpheniramine + Dextromethorphan', category: 'Syrups', brand: 'Corex', manufacturer: 'Pfizer', purchasePrice: 102.0, sellingPrice: 125.0, mrp: 138.5, unit: 'Bottle' },

  // Ointments & Creams
  { name: 'Volini Gel 15g', genericName: 'Diclofenac + Methyl Salicylate + Menthol', category: 'Others', brand: 'Volini', manufacturer: 'Sun Pharma', purchasePrice: 58.0, sellingPrice: 72.0, mrp: 80.0, unit: 'Piece' },
  { name: 'Moov Cream 25g', genericName: 'Oil of Wintergreen + Menthol + Turpentine Oil', category: 'Others', brand: 'Moov', manufacturer: 'Reckitt', purchasePrice: 82.0, sellingPrice: 102.0, mrp: 115.0, unit: 'Piece' },
  { name: 'Betnovate-N Cream 20g', genericName: 'Betamethasone + Neomycin', category: 'Others', brand: 'Betnovate', manufacturer: 'GSK', purchasePrice: 38.0, sellingPrice: 48.0, mrp: 53.5, unit: 'Piece' },
  { name: 'Betnovate-C Cream 20g', genericName: 'Betamethasone + Clioquinol', category: 'Others', brand: 'Betnovate', manufacturer: 'GSK', purchasePrice: 40.0, sellingPrice: 50.0, mrp: 55.8, unit: 'Piece' },
  { name: 'Quadriderm RF Cream 5g', genericName: 'Beclomethasone + Clotrimazole + Neomycin', category: 'Others', brand: 'Quadriderm', manufacturer: 'Fulford', purchasePrice: 72.0, sellingPrice: 90.0, mrp: 99.5, unit: 'Piece' }
];
