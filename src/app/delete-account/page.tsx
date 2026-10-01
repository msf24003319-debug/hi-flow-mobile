export const metadata = {
  title: 'Delete Your Hi Flow Pump Account',
  description:
    'Learn how to request deletion of your Hi Flow Pump account and associated personal data.',
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-bg text-white">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <p className="text-sm font-semibold text-brand">Hi Flow Pump</p>
          <a
            href="/privacy-policy"
            className="text-sm text-subtle underline decoration-border underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            View Privacy Policy
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="max-w-2xl border-b border-border pb-8 sm:pb-10">
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Delete Your Hi Flow Pump Account
          </h1>
          <p className="mt-4 text-sm leading-6 text-subtle sm:text-base">
            Customers and shopkeepers can request deletion of their Hi Flow Pump account and
            associated personal information by contacting our support team.
          </p>
        </header>

        <div className="max-w-2xl space-y-9 pt-8 text-sm leading-7 text-subtle sm:space-y-10 sm:pt-10 sm:text-base">
          <section aria-labelledby="request-heading">
            <h2 id="request-heading" className="mb-3 text-lg font-semibold text-white">
              How to request account deletion
            </h2>
            <p>
              Call Hi Flow support at{' '}
              <a
                href="tel:+923120613945"
                className="font-medium text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                +92 312 0613945
              </a>{' '}
              and ask to delete your Hi Flow Pump account. To help us locate and verify your account,
              provide:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-brand">
              <li>Your registered name.</li>
              <li>The email address or phone number registered to your account.</li>
              <li>Your account type: customer or shopkeeper.</li>
              <li>A clear statement that you are requesting account deletion.</li>
            </ul>
            <p className="mt-3">
              Do not share your password or CNIC number in an account-deletion request. We may ask
              for reasonable verification to confirm that you own the account.
            </p>
          </section>

          <section aria-labelledby="data-heading">
            <h2 id="data-heading" className="mb-3 text-lg font-semibold text-white">
              Data that may be deleted
            </h2>
            <p>
              After your request is reviewed and verified, we will delete your account and eligible
              associated personal data according to our data-retention practices. This may include:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-brand">
              <li>Account and profile information.</li>
              <li>Contact information.</li>
              <li>Customer or shopkeeper account information.</li>
              <li>Identity-verification information, including CNIC images, where eligible for deletion.</li>
              <li>Other personal information associated with your account where deletion is legally and technically possible.</li>
            </ul>
          </section>

          <section aria-labelledby="retention-heading">
            <h2 id="retention-heading" className="mb-3 text-lg font-semibold text-white">
              Review and retained information
            </h2>
            <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-brand">
              <li>We review your request and verify that you own the account.</li>
              <li>We delete the account and eligible associated personal data under our retention practices.</li>
              <li>
                Some information may need to be retained when required by law or for security,
                fraud prevention, accounting, tax, dispute resolution, or other legitimate business
                requirements. Retained information is kept only for the applicable retention period
                and handled according to our{' '}
                <a
                  href="/privacy-policy"
                  className="font-medium text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                >
                  Privacy Policy
                </a>
                .
              </li>
            </ol>
          </section>

          <p className="border-t border-border pt-6 text-sm">
            For details about how Hi Flow handles personal information,{' '}
            <a
              href="/privacy-policy"
              className="font-medium text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              View Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}