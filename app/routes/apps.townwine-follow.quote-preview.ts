import type {LoaderFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';

export {action} from './apps.townwine-follow.group-buy-registration';

export async function loader({request}:LoaderFunctionArgs){
 await authenticate.public.appProxy(request);
 return new Response(null,{status:302,headers:{Location:'/apps/townwine-follow/group-buy-registration','Cache-Control':'no-store'}});
}
