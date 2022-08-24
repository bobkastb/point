

export function isError(e:any): e is Error {
        return isObject(e) &&
            (objectToString(e) === '[object Error]' || e instanceof Error);
}

export function isObject(arg:any):boolean {
        return typeof arg === 'object' && arg !== null;
}
  
  
export function objectToString(o:string):string {
        return Object.prototype.toString.call(o);
}