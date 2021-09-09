import Task from '@harlem/task';

import {
    getStore,
    bootstrap,
} from '@harlem/testing';

import actionsExtension, {
    ActionAbortError,
} from '../src';

interface UserInfo {
    firstName: string;
    lastName: string;
    age: number;
}

function fetchUserInfo(controller: AbortController, timeout: number = 300): Task<UserInfo> {
    return new Task((resolve, reject, controller, onAbort) => {
        const handle = setTimeout(() => resolve({
            firstName: 'Jane',
            lastName: 'Doe',
            age: 32,
        }), timeout);

        onAbort(() => (clearTimeout(handle), reject('Aborted!')));
    }, controller);
}

describe('Actions Extension', () => {

    const getInstance = () => {
        const instance = getStore({
            extensions: [
                actionsExtension(),
            ],
        });

        const loadUserInfoName = 'load-user-info';
        const loadUserInfo = instance.store.action(loadUserInfoName, async (_, mutate, controller) => {
            const userDetails = await fetchUserInfo(controller);

            mutate(state => Object.assign(state.details, userDetails));
        });

        return {
            ...instance,
            loadUserInfoName,
            loadUserInfo,
        };
    };

    let instance = getInstance();

    beforeAll(() => bootstrap());
    beforeEach(() => instance = getInstance());
    afterEach(() => instance.store.destroy());

    test('Runs an action', async () => {
        const {
            loadUserInfo,
        } = instance;

        const {
            state,
        } = instance.store;

        await loadUserInfo();

        expect(state.details.firstName).toBe('Jane');
        expect(state.details.lastName).toBe('Doe');
        expect(state.details.age).toBe(32);
    });

    test('Handles run count', async () => {
        const {
            loadUserInfo,
            loadUserInfoName,
        } = instance;

        const {
            state,
            hasActionRun,
            isActionRunning,
        } = instance.store;

        expect(hasActionRun(loadUserInfoName)).toBe(false);
        expect(isActionRunning(loadUserInfoName)).toBe(false);

        const promise = loadUserInfo();

        expect(isActionRunning(loadUserInfoName)).toBe(true);

        await promise;

        expect(state.details.firstName).toBe('Jane');
        expect(state.details.lastName).toBe('Doe');
        expect(state.details.age).toBe(32);
        expect(hasActionRun(loadUserInfoName)).toBe(true);
    });

    test('Handles cancellation', async () => {
        const {
            loadUserInfo,
            loadUserInfoName,
        } = instance;

        const {
            state,
            hasActionRun,
        } = instance.store;

        const task = loadUserInfo();

        setTimeout(() => task.abort(), 100);

        try {
            await task;
        } catch (error) {
            expect(error).toBeInstanceOf(ActionAbortError);
        } finally {
            expect(state.details.firstName).toBe('');
            expect(state.details.lastName).toBe('');
            expect(state.details.age).toBe(0);
            expect(hasActionRun(loadUserInfoName)).toBe(false);
        }
    });

    test('Handles concurrency', async () => {
        const {
            action,
        } = instance.store;

        const singleAction = action('single-action', async () => {});
        const concurrentAction = action('concurrent-action', async () => {}, {
            parallel: true,
        });

        let hasSingleFailed = false;

        try {
            await Promise.all([
                singleAction(),
                singleAction(),
            ]);
        } catch {
            hasSingleFailed = true;
        }

        let hasConcurrentFailed = false;

        try {
            await Promise.all([
                concurrentAction(),
                concurrentAction(),
            ]);
        } catch {
            hasConcurrentFailed = true;
        }

        expect(hasSingleFailed).toBe(true);
        expect(hasConcurrentFailed).toBe(false);
    });

    test('Handles errors', async () => {
        const {
            action,
            hasActionFailed,
            getActionErrors,
        } = instance.store;

        const name = 'failing-action';
        const catchAssertion = jest.fn();

        const failingAction = action(name, async () => {
            throw new Error('failed');
        });

        try {
            await failingAction();
        } catch {
            catchAssertion();
        }

        const errors = getActionErrors(name);

        expect(catchAssertion).toHaveBeenCalled();
        expect(hasActionFailed(name)).toBe(true);
        expect(errors.length).toBe(1);
        expect(errors[0].error).toBeInstanceOf(Error);
    });

    test('Handles action resetting', async () => {
        const {
            loadUserInfo,
            loadUserInfoName,
        } = instance;

        const {
            hasActionRun,
            resetActionState,
        } = instance.store;

        expect(hasActionRun(loadUserInfoName)).toBe(false);

        await loadUserInfo();

        expect(hasActionRun(loadUserInfoName)).toBe(true);
        resetActionState();
        expect(hasActionRun(loadUserInfoName)).toBe(false);
    });

    test('Handles triggers', async () => {
        const {
            action,
            onBeforeAction,
            onAfterAction,
            onActionSuccess,
            onActionError,
        } = instance.store;

        const name = 'test-action';
        const beforeTrigger = jest.fn();
        const afterTrigger = jest.fn();
        const successTrigger = jest.fn();
        const errorTrigger = jest.fn();

        const testAction = action(name, async (throwError?: boolean) => {
            if (throwError) {
                throw new Error('failed');
            }
        });

        const listeners = [
            onBeforeAction(name, beforeTrigger),
            onAfterAction(name, afterTrigger),
            onActionSuccess(name, successTrigger),
            onActionError(name, errorTrigger),
        ];

        const run = (throwError?: boolean) => testAction(throwError).catch(() => {});

        await Promise.all([
            run(false),
            run(true),
        ]);

        expect(beforeTrigger).toHaveBeenCalledTimes(2);
        expect(afterTrigger).toHaveBeenCalledTimes(2);
        expect(errorTrigger).toHaveBeenCalledTimes(1);
        expect(successTrigger).toHaveBeenCalledTimes(1);

        listeners.forEach(({ dispose }) => dispose());
    });

});