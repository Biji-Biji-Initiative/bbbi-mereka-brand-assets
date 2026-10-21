"use client";
import { useFormStatus } from "react-dom";
import { SignInWithMereka, type SignInWithMerekaButtonProps } from "./SignInWithMereka";

/**
 * Submit button for a server-action form; shows the spinner while the action runs.
 * Works without JavaScript because the form posts natively. Requires React 19 (useFormStatus).
 *
 *   <form action={signInAction}><SignInWithMerekaSubmit fullWidth /></form>
 */
export function SignInWithMerekaSubmit({ loading, ...props }: Omit<SignInWithMerekaButtonProps, "type">) {
  const { pending } = useFormStatus();
  return <SignInWithMereka {...props} type="submit" loading={pending || loading} />;
}
