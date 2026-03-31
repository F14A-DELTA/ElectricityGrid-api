import http from 'k6/http';
import { check, sleep } from 'k6';


const BASE_URL = __ENV.TARGET_URL || 'http://ec2-54-86-254-66.compute-1.amazonaws.com:3000';
const API_KEY = __ENV.API_KEY || 'local-dev-token';


export const options = {
    stages: [
        { duration: '30s', target: 50 },  
        { duration: '1m', target: 50 },   
        { duration: '30s', target: 100 }, 
        { duration: '30s', target: 100 }, 
        { duration: '30s', target: 0 },   
    ],
    thresholds: {
        http_req_duration: ['p(95)<750'], 
        http_req_failed: ['rate<0.02'],   
    },
};


export default function () {
    const healthRes = http.get(`${BASE_URL}/v1/health`);
    check(healthRes, {
        'health status is 200': (r) => r.status === 200,
    });

    sleep(1);

    const params = {
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json'
        },
    };

    const liveRes = http.get(`${BASE_URL}/v1/live?network=NEM`, params);
    check(liveRes, {
        'live route is 200': (r) => r.status === 200,
    });

    sleep(0.5);

    const regionRes = http.get(`${BASE_URL}/v1/live/region/NSW1`, params);
    check(regionRes, {
        'region route is 200': (r) => r.status === 200,
    });
    
    sleep(0.5);
    
    const configRes = http.get(`${BASE_URL}/v1/live/price`, params);
    check(configRes, {
        'price stats route is 200': (r) => r.status === 200,
    });
    
    sleep(Math.random() * 2 + 1);
}