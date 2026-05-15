import { redirect } from 'next/navigation'

export default function EditRuleRedirect() {
  redirect('/settings/recurring?tab=income')
}
