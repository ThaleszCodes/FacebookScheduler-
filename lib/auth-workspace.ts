// Repeated auth notifications for the same account update credentials only.
// A full reload would unmount forms and discard uncontrolled input values.
export function shouldReloadWorkspace(
  previousUser: string | null | undefined,
  nextUser: string | null,
) {
  return previousUser === undefined || previousUser !== nextUser;
}
