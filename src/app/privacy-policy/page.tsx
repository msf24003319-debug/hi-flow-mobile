export const metadata = {
  title: 'Privacy Policy | Hi Flow Pump Industries',
  description: 'Learn what information Hi Flow collects, how it is used, and how to contact us about your privacy.',
};

const sections = [
  { id: 'information', label: 'Information we collect' },
  { id: 'use', label: 'How we use information' },
  { id: 'verification', label: 'Identity verification' },
  { id: 'sharing', label: 'How information is shared' },
  { id: 'retention', label: 'Retention and security' },
  { id: 'your-choices', label: 'Your choices' },
  { id: 'contact', label: 'Contact us' },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-bg text-white">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <p className="text-xs font-bold uppercase text-brand">
            Hi Flow Pump Industries
          </p>
          <a
            href="tel:+923120613945"
            className="text-sm font-medium text-subtle transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            Call support
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="max-w-3xl border-b border-border pb-8 sm:pb-10">
          <p className="mb-3 text-xs font-semibold uppercase text-brand">
            Your information and choices
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-subtle sm:text-base">
            This policy explains how Hi Flow Pump Industries collects, uses, and protects information
            when you use the Hi Flow app and related services.
          </p>
          <p className="mt-5 text-xs text-muted">Effective date: October 1, 2026</p>
        </header>

        <div className="grid gap-10 pt-8 sm:gap-12 sm:pt-10 md:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Privacy policy sections" className="h-fit md:sticky md:top-6">
            <p className="mb-3 text-xs font-semibold uppercase text-muted">
              On this page
            </p>
            <ul className="space-y-2 border-l border-border pl-4">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-sm leading-5 text-subtle transition-colors hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="min-w-0 max-w-3xl space-y-9 text-sm leading-7 text-subtle sm:space-y-10 sm:text-[15px]">
            <section id="information" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">Information we collect</h2>
              <p>
                Depending on how you use Hi Flow, we may collect information you provide, including:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-brand">
                <li>
                  <span className="text-white">Account and identity details:</span> name, email
                  address, phone number, account role, CNIC number and images of both sides of your
                  CNIC, and profile photo. Shopkeepers may also provide a shop name and service area.
                </li>
                <li>
                  <span className="text-white">Orders and fulfilment:</span> products and quantities
                  ordered, order history and status, your selected delivery or pickup option and
                  location, and any note you add to an order.
                </li>
                <li>
                  <span className="text-white">Requests and contributions:</span> motor inquiries,
                  service requests, product reviews and ratings, feedback, and franchise applications
                  with the details you choose to submit.
                </li>
              </ul>
              <p className="mt-3">
                Our authentication, hosting, and database providers may also process technical
                information, such as connection data, to operate, secure, and troubleshoot the service.
              </p>
            </section>

            <section id="use" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">How we use information</h2>
              <p>We use information to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-brand">
                <li>Create and manage accounts and authenticate users.</li>
                <li>Verify account identity and help prevent misuse or fraudulent activity.</li>
                <li>Process orders, arrange delivery or pickup, and provide order updates.</li>
                <li>Respond to inquiries, service requests, feedback, reviews, and franchise applications.</li>
                <li>Maintain, secure, and improve the app and meet applicable legal obligations.</li>
              </ul>
            </section>

            <section id="verification" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">Identity verification</h2>
              <p>
                During registration, we send the CNIC number you enter and images of the front and
                back of your CNIC to our identity-verification service. The service reads the number
                from each image and compares it with the number you entered. The images are also
                stored in private storage so authorized Hi Flow reviewers can complete verification.
                Text matching does not establish that an ID is genuine; verification may include a
                manual review.
              </p>
            </section>

            <section id="sharing" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">How information is shared</h2>
              <p>
                We share information only as needed to provide and protect Hi Flow. This includes
                service providers that support authentication, database and file storage, or CNIC
                text verification; authorized Hi Flow personnel who process orders and account
                reviews; and authorities or other parties when required by law or necessary to
                protect users, the service, or our rights. We do not sell personal information.
              </p>
            </section>

            <section id="retention" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">Retention and security</h2>
              <p>
                We keep information for as long as needed to provide the service, manage your
                account and transactions, meet legal requirements, and resolve disputes. Retention
                periods may vary by type of information. We use reasonable safeguards, including
                private storage and access controls for identity documents. No online service can
                guarantee absolute security.
              </p>
            </section>

            <section id="your-choices" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">Your choices</h2>
              <p>
                You can ask to access, correct, or delete personal information associated with your
                account by contacting us. We may need to retain some information where required by
                law or to complete transactions, protect the service, or resolve disputes. We may
                ask you to verify your identity before fulfilling a request.
              </p>
            </section>

            <section id="contact" className="scroll-mt-8 border-t border-border pt-7">
              <h2 className="mb-3 text-lg font-semibold text-white">Contact us</h2>
              <p>
                For privacy questions or requests about your information, contact Hi Flow Pump
                Industries:
              </p>
              <p className="mt-3">
                Phone:{' '}
                <a
                  href="tel:+923120613945"
                  className="font-medium text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                >
                  +92 312 0613945
                </a>
              </p>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}