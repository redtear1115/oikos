import { redirect } from 'next/navigation'

export default function NewRuleRedirect() {
  redirect('/settings/recurring?tab=expense')
}
