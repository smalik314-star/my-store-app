import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <main className="min-h-screen bg-background text-text px-6 py-12">
      <article className="max-w-3xl mx-auto bg-surface border border-border rounded-3xl p-8 md:p-12 shadow-sm">
        <Link to="/login" className="text-primary font-bold">← Back to sign in</Link>
        <h1 className="text-4xl font-black mt-6 mb-2">Privacy & Data Policy</h1>
        <p className="text-sm text-text/50 mb-8">Last updated: 19 July 2026</p>
        <div className="space-y-7 leading-relaxed text-text/75">
          <section><h2 className="text-xl font-black text-text mb-2">Data we process</h2><p>PharmaFlow stores account identity, pharmacy settings, inventory, suppliers, customers, purchases and invoices that you choose to enter. Google provides your name, email and profile image during sign-in.</p></section>
          <section><h2 className="text-xl font-black text-text mb-2">Purpose and access</h2><p>Data is used only to provide pharmacy billing, inventory, reporting and team-access features. Access is limited to active members of the same pharmacy workspace according to their assigned role.</p></section>
          <section><h2 className="text-xl font-black text-text mb-2">Storage and security</h2><p>Application data is stored in Google Firebase. Encryption in transit, authenticated access, tenant isolation and role-based security rules are used. Do not enter prescription, diagnosis or other clinical health information; this application is an inventory and billing system, not an electronic health-record system.</p></section>
          <section><h2 className="text-xl font-black text-text mb-2">AI and local data</h2><p>AI assistant history is kept only in the current browser-tab session and is cleared when you sign out or close the tab. Avoid placing personal or sensitive customer information in AI prompts.</p></section>
          <section><h2 className="text-xl font-black text-text mb-2">Retention and deletion</h2><p>Business records remain until the workspace owner requests deletion, subject to applicable accounting or tax retention requirements. Owners should export records before deletion. Contact the service administrator to request account or workspace deletion.</p></section>
          <section><h2 className="text-xl font-black text-text mb-2">Your responsibilities</h2><p>Workspace owners control staff access, data accuracy, lawful customer notices and retention. Remove access promptly when a team member leaves.</p></section>
          <section><h2 className="text-xl font-black text-text mb-2">Contact</h2><p>Privacy and deletion requests can be submitted to the administrator who provided access to your PharmaFlow workspace. A dedicated public privacy contact must be configured before general public launch.</p></section>
        </div>
      </article>
    </main>
  );
}
