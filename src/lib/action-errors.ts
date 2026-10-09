// Where a failed action is said. Anything the person asked for that didn't work is a toast
// (`toastError` in components/toast.tsx). The one exception is the API's verdict on a value typed
// into a form: that is validation, and it stays under the field it is about.

import { ApiError } from "./api/client";

/**
 * True when the API refused what was typed (400): a wrong code, a key that doesn't work, a repo
 * that doesn't exist. A form with one typed value shows this under that field; everything else
 * (a plan limit, a missing connection, too many tries, the server down) is a toast.
 */
export function refusedTypedValue(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 400;
}
