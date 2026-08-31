import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TranslationProvider } from './context/TranslationContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import VerifyCertificate from './pages/VerifyCertificate';
import ForgotPassword from './pages/ForgotPassword';
import SetPassword from './pages/SetPassword';

import SaDashboard from './pages/SaDashboard';
import SaSchools from './pages/SaSchools';
import SaSchoolDetail from './pages/SaSchoolDetail';
import SaRequested from './pages/SaRequested';
import SaEmployees from './pages/SaEmployees';
import SaSettings from './pages/SaSettings';
import SaReports from './pages/SaReports';
import SaWallet from './pages/SaWallet';
import SaCertApprovals from './pages/SaCertApprovals';

import SchoolDashboard from './pages/SchoolDashboard';
import Students from './pages/Students';
import StudentForm from './pages/StudentForm';
import StudentDetail from './pages/StudentDetail';
import Certificates from './pages/Certificates';
import SchoolSettings from './pages/SchoolSettings';
import CertificateTemplates from './pages/CertificateTemplates';
import CertificateTemplateEditor from './pages/CertificateTemplateEditor';
import Notifications from './pages/Notifications';

import DistDashboard from './pages/DistDashboard';
import DistSchools from './pages/DistSchools';
import DistCommission from './pages/DistCommission';
import DistSettings from './pages/DistSettings';

import SdDashboard from './pages/SdDashboard';
import SdSchools from './pages/SdSchools';
import SdDistributors from './pages/SdDistributors';
import SdDistributorDetail from './pages/SdDistributorDetail';
import SdSettings from './pages/SdSettings';
import SdCampRequests from './pages/SdCampRequests';
import SdIdCardRequests from './pages/SdIdCardRequests';

import SchoolCampRequests from './pages/SchoolCampRequests';
import DistCampRequests from './pages/DistCampRequests';
import DistIdCardRequests from './pages/DistIdCardRequests';
import SaCampRequests from './pages/SaCampRequests';
import SaIdCardRequests from './pages/SaIdCardRequests';

export default function App() {
  return (
    <TranslationProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Each role has its own shareable login URL. Do not expose a role picker. */}
            <Route path="/" element={<Navigate to="/login/school" replace />} />
            <Route path="/login/super-admin" element={<Login role="superAdmin" />} />
            <Route path="/login/school" element={<Login role="schoolAdmin" />} />
            <Route path="/login/distributor" element={<Login role="distributor" />} />
            <Route path="/login/super-distributor" element={<Login role="superDistributor" />} />
            <Route path="/verify/:id" element={<VerifyCertificate />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/reset-password" element={<SetPassword />} />

            {/* Super Admin */}
            <Route path="/sa-dashboard" element={<ProtectedRoute role="superAdmin"><SaDashboard /></ProtectedRoute>} />
            <Route path="/sa-schools" element={<ProtectedRoute role="superAdmin"><SaSchools /></ProtectedRoute>} />
            <Route path="/sa-schools/:id" element={<ProtectedRoute role="superAdmin"><SaSchoolDetail /></ProtectedRoute>} />
            <Route path="/sa-requested" element={<ProtectedRoute role="superAdmin"><SaRequested /></ProtectedRoute>} />
            <Route path="/sa-employees" element={<ProtectedRoute role="superAdmin"><SaEmployees /></ProtectedRoute>} />
            <Route path="/sa-settings" element={<ProtectedRoute role="superAdmin"><SaSettings /></ProtectedRoute>} />
            <Route path="/sa-reports" element={<ProtectedRoute role="superAdmin"><SaReports /></ProtectedRoute>} />
            <Route path="/sa-wallet" element={<ProtectedRoute role="superAdmin"><SaWallet /></ProtectedRoute>} />
            <Route path="/sa-cert-approvals" element={<ProtectedRoute role="superAdmin"><SaCertApprovals /></ProtectedRoute>} />

            {/* School Admin */}
            <Route path="/school-dashboard" element={<ProtectedRoute role="schoolAdmin"><SchoolDashboard /></ProtectedRoute>} />
            <Route path="/students" element={<ProtectedRoute role="schoolAdmin"><Students /></ProtectedRoute>} />
            <Route path="/students/new" element={<ProtectedRoute role="schoolAdmin"><StudentForm /></ProtectedRoute>} />
            <Route path="/students/:id" element={<ProtectedRoute role="schoolAdmin"><StudentDetail /></ProtectedRoute>} />
            <Route path="/students/:id/edit" element={<ProtectedRoute role="schoolAdmin"><StudentForm /></ProtectedRoute>} />
            <Route path="/certificates" element={<ProtectedRoute role="schoolAdmin"><Certificates /></ProtectedRoute>} />
            <Route path="/school-settings" element={<ProtectedRoute role="schoolAdmin"><SchoolSettings /></ProtectedRoute>} />
            <Route path="/certificate-templates" element={<ProtectedRoute role="schoolAdmin"><CertificateTemplates /></ProtectedRoute>} />
            <Route path="/certificate-templates/:id/edit" element={<ProtectedRoute role="schoolAdmin"><CertificateTemplateEditor /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

            {/* School Admin — Camp */}
            <Route path="/camp-requests" element={<ProtectedRoute role="schoolAdmin"><SchoolCampRequests /></ProtectedRoute>} />

            {/* Distributor */}
            <Route path="/dist-dashboard" element={<ProtectedRoute role="distributor"><DistDashboard /></ProtectedRoute>} />
            <Route path="/dist-schools" element={<ProtectedRoute role="distributor"><DistSchools /></ProtectedRoute>} />
            <Route path="/dist-commission" element={<ProtectedRoute role="distributor"><DistCommission /></ProtectedRoute>} />
            <Route path="/dist-settings" element={<ProtectedRoute role="distributor"><DistSettings /></ProtectedRoute>} />
            <Route path="/dist-camp-requests" element={<ProtectedRoute role="distributor"><DistCampRequests /></ProtectedRoute>} />
            <Route path="/dist-id-card-requests" element={<ProtectedRoute role="distributor"><DistIdCardRequests /></ProtectedRoute>} />

            {/* Super Distributor */}
            <Route path="/sd-dashboard" element={<ProtectedRoute role="superDistributor"><SdDashboard /></ProtectedRoute>} />
            <Route path="/sd-schools" element={<ProtectedRoute role="superDistributor"><SdSchools /></ProtectedRoute>} />
            <Route path="/sd-distributors" element={<ProtectedRoute role="superDistributor"><SdDistributors /></ProtectedRoute>} />
            <Route path="/sd-distributors/:id" element={<ProtectedRoute role="superDistributor"><SdDistributorDetail /></ProtectedRoute>} />
            <Route path="/sd-settings" element={<ProtectedRoute role="superDistributor"><SdSettings /></ProtectedRoute>} />
            <Route path="/sd-camp-requests" element={<ProtectedRoute role="superDistributor"><SdCampRequests /></ProtectedRoute>} />
            <Route path="/sd-id-card-requests" element={<ProtectedRoute role="superDistributor"><SdIdCardRequests /></ProtectedRoute>} />

            {/* Super Admin — Camps & ID Cards */}
            <Route path="/sa-camp-requests" element={<ProtectedRoute role="superAdmin"><SaCampRequests /></ProtectedRoute>} />
            <Route path="/sa-id-card-requests" element={<ProtectedRoute role="superAdmin"><SaIdCardRequests /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TranslationProvider>
  );
}
