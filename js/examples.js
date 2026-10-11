/*
 * Example models for the "Load example…" menu.
 */

const EXAMPLES = {
  gamma5: `model {
  for (i in 1:Ntotal) {
    mu[i] <- beta0 + beta[1]*X[i,1] + beta[2]*X[i,2] + beta[3]*X[i,3] +
             beta[4]*X[i,4] + beta[5]*X[i,5]
    sh[i] <- pow(mu[i], 2) / pow(sigma, 2)
    ra[i] <- mu[i] / pow(sigma, 2)
    y[i] ~ dgamma(sh[i], ra[i])
  }
  beta0 ~ dnorm(M0, 1/pow(S0, 2))
  for (j in 1:5) {
    beta[j] ~ dnorm(M[j], 1/pow(S[j], 2))
  }
  sigma ~ dgamma(A, B)
}`,
  linear: `model {
  for (i in 1:N) {
    mu[i] <- beta0 + beta1 * x[i]
    y[i] ~ dnorm(mu[i], 1/sigma^2)
  }
  beta0 ~ dnorm(M0, 1/S0^2)
  beta1 ~ dnorm(M1, 1/S1^2)
  sigma ~ dunif(L, H)
}`,
  robust: `model {
  for (i in 1:N) {
    y[i] ~ dt(beta0 + beta1 * x[i], 1/sigma^2, nu)
  }
  beta0 ~ dnorm(0, 1/10^2)
  beta1 ~ dnorm(0, 1/10^2)
  sigma ~ dunif(1.0E-3, 1.0E+3)
  nu ~ dexp(1/29)
}`,
  coins: `model {
  for (i in 1:Ntotal) {
    y[i] ~ dbern(theta[s[i]])
  }
  for (s in 1:Nsubj) {
    theta[s] ~ dbeta(omega*(kappa-2)+1, (1-omega)*(kappa-2)+1)
  }
  omega ~ dbeta(A, B)
  kappa ~ dgamma(S, R)
}`,
};
