export const validateConfigNumber = (value: string): string => {
    if (isNaN(parseInt(value))) {
        return '⚠️ Please provide a valid number for minimum votes.';
    }

    if (parseInt(value) < 1) {
        return '⚠️ Minimum votes must be greater than 0.';
    }

    return '';
};
