// Static reference data for the School Admin "Educational Certificates" info
// page — which documents a school needs to help a student apply for each of
// these 4 government certificates (Maharashtra revenue-department process).
// Kept as a plain frontend module for now per product decision (no DB table
// or API needed yet), but shaped so it can move to one later without
// changing how EducationalCertificates.js renders it: each certificate is
// {id, title, marathiTitle, icon, documents[], downloadAction}, and each
// document is {en, mr} — `mr` is null where the source requirements gave no
// Marathi text for that specific line (e.g. "Aadhar Card" in some lists).
// `downloadAction` describes the certificate's "Download Namuna/Form" item,
// rendered as its own disabled "Coming Soon" button rather than a checklist
// row, since no such template files exist in the project yet (see the page
// component for why real files should replace this once they do).
const EDUCATIONAL_CERTIFICATES = [
  {
    id: 'caste-certificate',
    title: 'Caste Certificate',
    marathiTitle: 'जातीचे प्रमाणपत्र',
    icon: 'fa-scroll',
    documents: [
      { en: 'Bonafide Certificate / Leaving Certificate / Birth Certificate', mr: 'अर्जदाराचा शाळा सोडल्याचा दाखला / बोनाफाईड दाखला / जन्म दाखला' },
      { en: 'Father LC', mr: 'वडिलांचा शाळा सोडल्याचा दाखला' },
      { en: 'Father Caste Certificate', mr: 'वडिलांचा जातीचा दाखला' },
      { en: 'Grandfather LC', mr: 'आजोबांचा शाळा सोडल्याचा दाखला' },
      { en: 'Grandfather Caste Certificate', mr: 'आजोबांचा जातीचा दाखला' },
      { en: 'Kunbi Supporting Documents', mr: 'अर्जदार कुणबी जातीचा असल्यास कुणबी पर्यंत सर्व पुरावे आवश्यक असतील.' },
      { en: 'Caste Validity Certificate', mr: 'रक्त नाते संबंधातील जात वैधता प्रमाणपत्र – असल्यास' },
      { en: 'Passport Photo', mr: 'अर्जदाराचा व उमेदवाराचा पासपोर्ट फोटो' },
      { en: 'Affidavit / Undertaking / Genealogy', mr: 'हमीपत्र / शपथ पत्र / वंशावळ' },
      { en: 'Aadhar Card', mr: null },
      { en: 'Signature', mr: null },
      { en: 'Scanned Copy', mr: null },
    ],
    downloadAction: { label: 'Download Namuna' },
  },
  {
    id: 'income-certificate',
    title: 'Income Certificate',
    marathiTitle: 'उत्पन्नाचा दाखला',
    icon: 'fa-file-invoice-dollar',
    documents: [
      { en: 'Income Certificate from Gram Mahasul Adhikari / Talathi', mr: 'ग्राम महसूल अधिकारी / तलाठी यांचा उत्पन्नाचा दाखला' },
      { en: 'Aadhar Card', mr: null },
      { en: 'Ration Card', mr: null },
      { en: 'Applicant Photo', mr: 'अर्जदाराचा १ फोटो' },
      { en: 'Signature', mr: null },
      { en: 'Scanned Copy', mr: null },
    ],
    downloadAction: { label: 'Download Namuna' },
  },
  {
    id: 'age-domicile-nationality',
    title: 'Age, Domicile and Nationality Certificate',
    marathiTitle: 'वय अधिवास व राष्ट्रीयत्व दाखला',
    icon: 'fa-flag',
    documents: [
      { en: 'Bonafide Certificate / Leaving Certificate / Birth Certificate', mr: 'अर्जदाराचा शाळा सोडल्याचा दाखला / बोनाफाईड दाखला / जन्म दाखला' },
      { en: 'Father LC', mr: 'वडिलांचा शाळा सोडल्याचा दाखला' },
      { en: 'Aadhar Card', mr: 'आधार कार्ड' },
      { en: 'Ration Card', mr: 'रेशन कार्ड' },
      { en: 'Applicant Photo', mr: 'अर्जदाराचा १ फोटो' },
      { en: 'Self Declaration', mr: null },
      { en: 'Signature', mr: null },
      { en: 'Scanned Copy', mr: null },
    ],
    downloadAction: { label: 'Download Form' },
  },
  {
    id: 'non-creamy-layer',
    title: 'Non-Creamy Layer Certificate',
    marathiTitle: 'नॉन क्रिमीलेयर दाखला',
    icon: 'fa-layer-group',
    documents: [
      { en: 'Caste Certificate', mr: 'जातीचा दाखला' },
      { en: 'Income Certificate', mr: 'मागील ३ वर्षाचा तहसीलदार यांचेकडील उत्पन्नाचा दाखला' },
      { en: 'LC / Bonafide / Birth Certificate', mr: 'अर्जदाराचा शाळा सोडल्याचा दाखला / बोनाफाईड दाखला / जन्म दाखला' },
      { en: 'Aadhar Card', mr: 'आधार कार्ड' },
      { en: 'Applicant Photo', mr: '1 Photo' },
      { en: 'Self Declaration', mr: null },
      { en: 'Signature', mr: null },
      { en: 'Scanned Copy', mr: null },
    ],
    downloadAction: { label: 'Download Form' },
  },
];

export default EDUCATIONAL_CERTIFICATES;
