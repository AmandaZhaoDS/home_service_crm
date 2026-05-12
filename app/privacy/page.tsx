import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy – JobStack',
};

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: {updated}</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Overview</h2>
            <p>
              JobStack ("we," "us," or "our") provides an AI-powered home service field management platform
              ("Service"). This Privacy Policy describes how we collect, use, and protect information about
              you and your customers when you use our Service, including any SMS/text message communications
              sent through the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account information:</strong> name, email address, and password when you register.</li>
              <li><strong>Business data:</strong> job records, customer records, invoices, appointments, and notes that you enter into the platform.</li>
              <li><strong>Customer contact information:</strong> names, phone numbers, and addresses of your service customers, which you provide or which are captured from inbound SMS messages.</li>
              <li><strong>SMS message content:</strong> the text of inbound messages sent to your business number and outbound messages sent to your customers via the platform.</li>
              <li><strong>Usage data:</strong> log data, IP addresses, browser type, and pages visited for security and service improvement purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. SMS / Text Messaging</h2>
            <p>
              JobStack uses SMS messaging to allow you to communicate with your customers, including sending
              appointment confirmations, job estimates, follow-up messages, and service reminders.
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                <strong>Consent:</strong> SMS messages are only sent to customers who have provided their
                phone number and consented to receive text communications from your business. Inbound
                messages from customers are treated as consent to reply.
              </li>
              <li>
                <strong>Opt-out:</strong> Customers can opt out of SMS communications at any time by
                replying <strong>STOP</strong> to any message. After opting out, no further messages will
                be sent. Customers can re-subscribe by texting <strong>START</strong>.
              </li>
              <li>
                <strong>Help:</strong> Customers can text <strong>HELP</strong> for assistance or contact
                us at the address below.
              </li>
              <li>
                <strong>Message frequency:</strong> Message frequency varies based on your business activity.
                Standard message and data rates may apply.
              </li>
              <li>
                <strong>No marketing sharing:</strong> We do not sell, rent, or share customer phone numbers
                or SMS message content with third parties for marketing or advertising purposes.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide, operate, and improve the Service.</li>
              <li>To deliver SMS messages on your behalf to your customers.</li>
              <li>To authenticate users and secure accounts.</li>
              <li>To respond to support requests and troubleshoot issues.</li>
              <li>To comply with applicable laws and regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Data Sharing and Disclosure</h2>
            <p>
              We do not sell your data or your customers' data. We share information only in these limited
              circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                <strong>Service providers:</strong> We use Twilio to deliver SMS messages, Supabase for
                database and authentication, and OpenAI for AI features. These providers process data
                solely to provide the Service and are contractually bound to protect your data.
              </li>
              <li>
                <strong>Legal compliance:</strong> We may disclose information if required by law or in
                response to valid legal process.
              </li>
              <li>
                <strong>Business transfer:</strong> In the event of a merger or acquisition, your data
                may transfer to the successor entity under the same privacy protections.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Data Retention</h2>
            <p>
              We retain your account and business data for as long as your account is active. You may
              delete your account and associated data at any time by contacting us. SMS message logs are
              retained for up to 90 days for troubleshooting purposes and then deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Security</h2>
            <p>
              We implement industry-standard security measures including encryption in transit (TLS),
              encrypted storage, and access controls to protect your data. However, no system is completely
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or export your
              personal data. To exercise these rights, contact us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify registered users of
              material changes by email or in-app notification. Continued use of the Service after changes
              take effect constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise your data rights, contact
              us at:
            </p>
            <p className="mt-2 font-medium text-gray-900">
              JobStack<br />
              Email: privacy@jobpilot.app
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 flex gap-4 text-sm text-gray-500">
          <Link href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-blue-600 transition-colors">Back to App</Link>
        </div>
      </div>
    </div>
  );
}
