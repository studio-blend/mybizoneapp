import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@mybizone/ui/card';

/**
 * Better Auth's verification link points to /api/auth/verify-email which sets
 * email_verified=true and (because autoSignInAfterVerification=true) signs the
 * user in, then redirects to BETTER_AUTH_URL by default. This page exists so the
 * UI can show a friendly message when users land here directly without a token.
 */
export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          Click the link we sent to your inbox. Once verified you'll be logged in automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Didn't get an email? Check spam, or sign up again with the same address.
        </p>
      </CardContent>
    </Card>
  );
}
