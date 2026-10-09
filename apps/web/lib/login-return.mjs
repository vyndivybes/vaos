const RECOVERY='/api/activepieces-mcp/code-recovery';
const MAKER='shyamsundhar1982@gmail.com';

// Allow only a literal, explicitly approved internal path. No user-controlled
// hostnames, extra query strings, fragment or encoded redirects are followed.
export function resolveLoginReturn(search='',authenticatedEmail=''){
  try{
    const params=new URLSearchParams(search);
    const values=params.getAll('next');
    return values.length===1&&params.size===1&&values[0]===RECOVERY&&
      String(authenticatedEmail).trim().toLowerCase()===MAKER
      ? RECOVERY:'/workspace';
  }catch{return '/workspace'}
}
