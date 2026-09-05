export { CLIENT_ID, ApiError } from './transport';
import { account } from './account';
import { vault } from './vault';
import { files } from './files';
import { settings } from './settings';
import { share } from './share';
export const api = {
  ...account,
  ...vault,
  ...files,
  ...settings,
  ...share,
}
