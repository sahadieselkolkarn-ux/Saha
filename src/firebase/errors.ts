
export type SecurityRuleContext = {
    path: string;
    operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
    requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
    public context: SecurityRuleContext;

    constructor(context: SecurityRuleContext) {
        let message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n`;
        message += JSON.stringify({
            details: 'This error is being surfaced by the application to provide more context about the security rule denial. See the context object below.',
            context: context
        }, null, 2);
        
        super(message);
        this.name = 'FirestorePermissionError';
        this.context = context;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, FirestorePermissionError);
        }
    }
}
