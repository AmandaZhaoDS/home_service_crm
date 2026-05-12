import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service – JobStack',
};

export default function TermsPage() {
  const updated = 'May 10, 2026';

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors">
            <span className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-bold">JP</span>
            <span><span className="text-gray-800">Job</span><span className="text-blue-600">Pilot</span></span>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500">Last updated: {updated}</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the JobStack platform ("Service"), you agree to be bound by these
              Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
              These Terms apply to all users, including home service business operators ("Operators") and
              their end customers who receive SMS communications.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Description of Service</h2>
            <p>
              JobStack is an AI-powered field service management platform that helps home service
              businesses manage jobs, customers, invoices, schedules, and communicate with customers via
              SMS text messaging.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. SMS Messaging Terms</h2>
            <p>
              JobStack enables Operators to send and receive SMS/text messages with their customers for
              business purposes, including appointment confirmations, job estimates, service updates, and
              follow-up communications.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">3.1 Message Types</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Appointment confirmations and reminders</li>
              <li>Job estimates and service quotes</li>
              <li>Job status updates (arrival, completion)</li>
              <li>Follow-up messages and satisfaction check-ins</li>
              <li>Customer-initiated inquiries and responses</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">3.2 Consent</h3>
            <p>
              SMS messages are sent only to customers who have provided explicit or implied consent by
              initiating contact, providing their phone number for service, or otherwise agreeing to
              receive text communications from the Operator's business.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">3.3 Opt-Out</h3>
            <p>
              Customers may opt out of SMS communications at any time by replying <strong>STOP</strong> to
              any message. Upon receipt of STOP, no further messages will be sent. To re-subscribe, text
              <strong> START</strong>.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">3.4 Help</h3>
            <p>
              For assistance, customers may reply <strong>HELP</strong> to any message or contact
              JobStack at privacy@jobstack.app.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">3.5 Message Frequency and Rates</h3>
            <p>
              Message frequency varies based on business activity. Standard message and data rates may
              apply. JobStack is not responsible for any charges incurred by recipients from their
              mobile carrier.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">3.6 No Spam or Unauthorized Marketing</h3>
            <p>
              Operators agree not to use the SMS features for unsolicited marketing, spam, or any
              communication that violates the Telephone Consumer Protection Act (TCPA), the CAN-SPAM Act,
              or any other applicable law. Violations may result in immediate account termination.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Operator Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You are responsible for obtaining proper consent from your customers before sending SMS messages.</li>
              <li>You are responsible for the accuracy of customer data entered into the platform.</li>
              <li>You agree not to use the Service to send harassing, illegal, or fraudulent messages.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You agree to comply with all applicable laws, including those governing SMS and electronic communications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Prohibited Uses</h2>
            <p>You may not use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Send unsolicited commercial messages (spam)</li>
              <li>Harass, threaten, or impersonate any person or entity</li>
              <li>Violate any applicable law or regulation</li>
              <li>Transmit malware, viruses, or harmful code</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Third-Party Services</h2>
            <p>
              The Service integrates with third-party providers including Twilio (SMS delivery), Supabase
              (data storage), and OpenAI (AI features). Your use of these integrated services is also
              subject to their respective terms and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Intellectual Property</h2>
            <p>
              The JobStack platform, including its code, design, and AI models, is proprietary to
              JobStack. You retain ownership of the business data you input. You grant JobStack a
              limited license to process your data solely to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" without warranties of any kind, express or implied.
              JobStack does not warrant that the Service will be uninterrupted, error-free, or free from
              security vulnerabilities.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, JobStack shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of the Service, including
              any SMS delivery failures or carrier-related issues.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Termination</h2>
            <p>
              We may suspend or terminate your account for violations of these Terms, illegal activity,
              or misuse of the SMS messaging features. You may cancel your account at any time by
              contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after changes
              take effect constitutes acceptance of the updated Terms. We will notify registered users
              of material changes by email or in-app notification.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the United States. Any disputes shall be resolved
              in accordance with applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">13. Contact</h2>
            <p>
              Questions about these Terms? Contact us at:
            </p>
            <p className="mt-2 font-medium text-gray-900">
              JobStack<br />
              Email: privacy@jobstack.app
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 flex gap-4 text-sm text-gray-500">
          <Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-blue-600 transition-colors">Back to App</Link>
        </div>
      </div>
    </div>
  );
}
