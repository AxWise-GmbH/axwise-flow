// function processOrder() { decoy in comment }
const decoyStr = "function processOrder() { decoy in string }";

export function fulfillOrder(item: string, count: number): string {
    return `order processed: ${item}`;
}

export class OrderService {
    validate(id: string): boolean {
        return id.length > 0;
    }
}

export class UserService {
    validate(id: string): boolean {
        return id.startsWith("user_");
    }
}

const router = {
    post: (path: string, handler: any) => ({ path, handler })
};
const otherRouter = {
    post: (path: string, handler: any) => ({ path, handler })
};

// 1. Direct async handler
router.post("/async", async (req: any, res: any) => {
    return res;
});

// 2. Synchronous handler
router.post("/sync", (req: any, res: any) => {
    return res;
});

// 3. Nested callback with outer sync handler
router.post("/nested", (req: any, res: any) => {
    setTimeout(async () => {
        // nested async
    }, 100);
    return res;
});

// 4. Unrelated receiver
otherRouter.post("/unrelated", async (req: any, res: any) => {
    return res;
});