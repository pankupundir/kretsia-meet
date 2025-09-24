import { createContext, useContext, useState } from "react";

const AuthContext = createContext();
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState(null);

  const login = (userData) => {
    try {
      // Generate a simple user ID
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const user = {
        uid: userId,
        displayName: userData.name || "Anonymous",
        email: userData.email || "",
        photoURL: userData.photoURL || "https://parkridgevet.com.au/wp-content/uploads/2020/11/Profile-300x300.png"
      };
      
      setUser(user);
      return user;
    } catch (error) {
      console.log(error);
      setUser(null);
      return error;
    }
  };

  const logout = () => {
    console.log("Logout");
    setUser(null);
    setRedirectUrl(null);
    return user;
  };

  const setRedirect = (url) => {
    setRedirectUrl(url);
  };

  const clearRedirect = () => {
    setRedirectUrl(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, setLoading, redirectUrl, setRedirect, clearRedirect }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a AuthProvider");
  }
  return context;
};

export { useAuth, AuthProvider };
