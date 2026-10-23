// Oct 23 2026 — Public Privacy Policy / Terms pages.
//
// Google checks these URLs ANONYMOUSLY while reviewing an OAuth consent
// screen, so they must render without a login. They are registered in App.js
// as plain Route entries, NOT wrapped in ProtectedRoute — wrapping them would
// bounce Google (and any client) to /login, which is exactly what
// https://myhomeusb.com/privacy did before these existed.
//
// The Limited Use paragraph in the privacy policy is not boilerplate: Google
// requires that exact disclosure for apps requesting sensitive scopes, which
// this one does (spreadsheets + drive.file for the Marketing Board's Google
// Sheets lead import).
import React from 'react';
import { Link } from 'react-router-dom';

const UPDATED = '23 October 2026';
const CONTACT = 'drawleadit@gmail.com';
const COMPANY = 'Urban Space Builders';
const PRODUCT = 'My Home (My Home USB)';

function Shell({ title, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <header className="mb-8 border-b border-gray-200 pb-6">
          <p className="text-xs font-semibold tracking-widest text-amber-600 uppercase">
            {COMPANY}
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {UPDATED}</p>
        </header>

        <article className="space-y-6 text-[15px] leading-relaxed text-gray-700">
          {children}
        </article>

        <footer className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="text-amber-700 hover:underline">Privacy Policy</Link>
            <Link to="/terms" className="text-amber-700 hover:underline">Terms of Service</Link>
            <Link to="/login" className="text-amber-700 hover:underline">Sign in</Link>
          </div>
          <p className="mt-4">
            Questions? Email <a className="text-amber-700 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </footer>
      </div>
    </div>
  );
}

function H({ children }) {
  return <h2 className="text-lg font-semibold text-gray-900 pt-2">{children}</h2>;
}

export function PrivacyPolicy() {
  return (
    <Shell title="Privacy Policy">
      <p>
        {PRODUCT} is an internal business application operated by {COMPANY}. It is not a
        consumer service and is not open to public sign-up — only people invited by an
        administrator can create an account or sign in.
      </p>

      <H>Information we hold</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Staff account data</strong> — name, work email, phone number and role, created when an administrator invites a user.</li>
        <li><strong>Business records</strong> — projects, estimates, payment schedules, vendor and material records, and related financial entries, all added by our own staff in the course of their work.</li>
        <li><strong>Client and enquiry data</strong> — names, phone numbers, email addresses and enquiry details belonging to our clients and prospective clients.</li>
        <li><strong>Technical data</strong> — a session cookie to keep a user signed in, and server logs recording access for security and troubleshooting.</li>
      </ul>

      <H>Google account data</H>
      <p>
        An administrator may connect a Google account so the application can import sales
        enquiries from Google Sheets they choose. When that connection is made we request
        these permissions:
      </p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li><code className="text-[13px] bg-gray-100 px-1.5 py-0.5 rounded">spreadsheets</code> — to read rows from the spreadsheets an administrator explicitly connects.</li>
        <li><code className="text-[13px] bg-gray-100 px-1.5 py-0.5 rounded">drive.file</code> — limited to files opened or created with this application. It does not grant access to the rest of your Google Drive.</li>
        <li>Your name, email address and profile picture, used only to show which Google account is connected.</li>
      </ul>
      <p>
        We read only the spreadsheets an administrator connects, and we use that data only
        to create and update enquiry records inside this application. Google data is never
        used for advertising, never sold, and never transferred to third parties except as
        described below. An administrator can disconnect the Google account at any time
        from Marketing Board → Google Sheets, which deletes the stored access and refresh
        tokens.
      </p>
      <p className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <strong>Limited Use disclosure.</strong> {PRODUCT}&apos;s use and transfer of information
        received from Google APIs to any other app will adhere to the{' '}
        <a
          className="text-amber-700 hover:underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <H>How we use it</H>
      <p>
        Data in this application is used to run our construction and project-management
        business: tracking enquiries, preparing estimates, managing projects, recording
        payments and producing internal reports. We do not sell data, and we do not use it
        for advertising or automated decision-making.
      </p>

      <H>Who can see it</H>
      <p>
        Access is restricted to invited employees, and what each person can see depends on
        their role. We share data outside the company only with service providers who help
        us operate the application (hosting, email delivery), or when we are required to by
        law.
      </p>

      <H>Storage and security</H>
      <p>
        Data is stored in a managed database on servers we control. Access requires an
        account, traffic is encrypted in transit over HTTPS, passwords are stored hashed,
        and actions that change financial records are recorded in an audit log. No system
        is perfectly secure, but we take reasonable steps to protect this information.
      </p>

      <H>How long we keep it</H>
      <p>
        Business and financial records are retained for as long as needed to run the
        business and to satisfy accounting and legal obligations. Staff accounts are
        deactivated when a person leaves. Google tokens are deleted on disconnection, or
        when Google revokes them.
      </p>

      <H>Your choices</H>
      <p>
        If you are a client or an enquirer and want to know what we hold about you, or want
        it corrected or deleted, email{' '}
        <a className="text-amber-700 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>{' '}
        and we will respond. You can also review or remove this application&apos;s access to
        your Google account at{' '}
        <a
          className="text-amber-700 hover:underline"
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          myaccount.google.com/permissions
        </a>.
      </p>

      <H>Changes</H>
      <p>
        If this policy changes we will update this page and the date above.
      </p>

      <H>Contact</H>
      <p>
        {COMPANY} — <a className="text-amber-700 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </Shell>
  );
}

export function TermsOfService() {
  return (
    <Shell title="Terms of Service">
      <p>
        These terms govern use of {PRODUCT}, an internal application operated by {COMPANY}.
        By signing in you agree to them.
      </p>

      <H>Who may use it</H>
      <p>
        Accounts are issued by an administrator to employees and authorised partners. There
        is no public sign-up. You may not share your account, and you are responsible for
        activity carried out under it. Tell us immediately if you believe your account has
        been used by someone else.
      </p>

      <H>Acceptable use</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Use the application only for {COMPANY} business, and only within the permissions your role grants.</li>
        <li>Do not attempt to access data or functions outside your role, or to disrupt or probe the service.</li>
        <li>Do not copy, export or disclose client, financial or employee data except as your work requires.</li>
        <li>Keep the information you see confidential — much of it is commercially sensitive or personal.</li>
      </ul>

      <H>Your content</H>
      <p>
        Records you enter — projects, estimates, payments, enquiries and documents — remain
        the property of {COMPANY}. We may retain them after your account is closed where we
        need them for business or legal reasons.
      </p>

      <H>Google Sheets connection</H>
      <p>
        If you connect a Google account, you confirm you are entitled to grant access to
        the spreadsheets you connect. That data is handled as set out in our{' '}
        <Link to="/privacy" className="text-amber-700 hover:underline">Privacy Policy</Link>.
        You can disconnect at any time.
      </p>

      <H>Availability</H>
      <p>
        We aim to keep the application available but do not guarantee uninterrupted
        service. It may be unavailable during maintenance, updates or circumstances outside
        our control, and features may change or be withdrawn.
      </p>

      <H>No warranty and limits</H>
      <p>
        The application is provided on an &quot;as is&quot; basis, without warranties of any kind so
        far as the law allows. Figures and reports it produces are working tools and should
        be checked before being relied on for a financial or contractual decision. To the
        extent permitted by law, {COMPANY} is not liable for indirect or consequential loss
        arising from use of the application.
      </p>

      <H>Suspension</H>
      <p>
        We may suspend or remove access at any time, in particular when employment or a
        contract ends, or where these terms have been breached.
      </p>

      <H>Governing law</H>
      <p>
        These terms are governed by the laws of India, and the courts of Tamil Nadu have
        jurisdiction over any dispute.
      </p>

      <H>Contact</H>
      <p>
        {COMPANY} — <a className="text-amber-700 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </Shell>
  );
}

export default PrivacyPolicy;
